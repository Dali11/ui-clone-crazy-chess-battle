import { NextRequest, NextResponse } from "next/server";
import { removeQuickMatchAnnounceMessages } from "@/lib/chat/challenge-messages";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/send";
import { quickMatchAcceptedPayload } from "@/lib/push/rules";
import { BATTLE_JOIN_WINDOW_SECONDS } from "@/lib/game/abort-config";

// games.time_control only accepts these 4 base categories; challenge time controls
// like "blitz3" (3+2) and "rapid15" (15+10) need to map down to their base category.
const GAME_TIME_CONTROL_MAP: Record<string, string> = {
  bullet: "bullet",
  blitz3: "blitz",
  blitz: "blitz",
  rapid: "rapid",
  rapid15: "rapid",
  classical: "classical",
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { challengeId } = await req.json();

    if (!challengeId) {
      return NextResponse.json({ error: "Challenge ID required" }, { status: 400 });
    }

    // Fetch the challenge (use admin to avoid RLS issues)
    const admin = createAdminClient();
    const { data: challenge, error } = await admin
      .from("challenges")
      .select("*")
      .eq("id", challengeId)
      .single();

    if (error || !challenge) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    if (challenge.challenger_id === user.id) {
      return NextResponse.json({ error: "You cannot accept your own challenge" }, { status: 400 });
    }

    // Check expiry
    if (challenge.expires_at && new Date(challenge.expires_at) < new Date()) {
      await admin.from("challenges").update({ status: "expired" }).eq("id", challengeId);
      // The announce message in the country room dies with the challenge.
      await removeQuickMatchAnnounceMessages(admin, challengeId);
      return NextResponse.json({ error: "Challenge has expired" }, { status: 400 });
    }

    // Already accepted — late tappers join the game as SPECTATORS (or as
    // players if they're one of the two). Previously they hit a dead-end
    // "no longer available" error, which read as "expired" to players.
    if (challenge.status === "accepted" && challenge.game_id) {
      return NextResponse.json({ gameId: challenge.game_id, spectator: challenge.acceptor_id !== user.id && challenge.challenger_id !== user.id });
    }

    // If the CHALLENGER is already playing another game, they will never
    // come to this board — auto-cancel the link instead of creating a
    // game that burns their clock while they're busy elsewhere.
    if (challenge.status === "pending") {
      const { data: challengerGames } = await admin
        .from("games")
        .select("id")
        .or(`white_player_id.eq.${challenge.challenger_id},black_player_id.eq.${challenge.challenger_id}`)
        .in("status", ["waiting", "playing"])
        .limit(1);
      if (challengerGames && challengerGames.length > 0) {
        const { data: cancelled } = await admin
          .from("challenges")
          .update({ status: "cancelled" })
          .eq("id", challengeId)
          .eq("status", "pending")
          .select("id")
          .single();
        if (cancelled) await removeQuickMatchAnnounceMessages(admin, challengeId);
        return NextResponse.json({ error: "Challenge cancelled — the player is in another game right now." }, { status: 400 });
      }
    }

    // Atomic claim — only succeeds if status is still 'pending'
    const { data: claimed, error: claimError } = await admin
      .from("challenges")
      .update({ status: "accepted", acceptor_id: user.id })
      .eq("id", challengeId)
      .eq("status", "pending")
      .select("*")
      .single();

    if (claimError || !claimed) {
      // Lost the accept race — fall back to the spectator path above:
      // re-fetch and send them to the game if it exists by now.
      const { data: refetched } = await admin.from("challenges").select("status, game_id, acceptor_id, challenger_id").eq("id", challengeId).single();
      if (refetched?.status === "accepted" && refetched.game_id) {
        return NextResponse.json({ gameId: refetched.game_id, spectator: refetched.acceptor_id !== user.id && refetched.challenger_id !== user.id });
      }
      return NextResponse.json({ error: "Challenge is no longer available" }, { status: 400 });
    }

    // Accepted — the announce message in the country room disappears.
    await removeQuickMatchAnnounceMessages(admin, challengeId);

    // Determine colors
    let whitePlayer = challenge.challenger_id;
    let blackPlayer = user.id;

    if (challenge.color === "black") {
      whitePlayer = user.id;
      blackPlayer = challenge.challenger_id;
    } else if (challenge.color === "random") {
      // Random color assignment
      if (Math.random() > 0.5) {
        whitePlayer = user.id;
        blackPlayer = challenge.challenger_id;
      }
    }

    // Create the game in a 2-minute "waiting" join window (battles model):
    // clocks frozen (no last_move_at), no no-show forfeit, until both
    // players are on the board (early start) or the window lapses. The
    // challenger may be away from the app — the push + in-app notification
    // below tells them their match is live and they have 2 minutes to
    // reach the board.
    const { data: game, error: gameError } = await admin
      .from("games")
      .insert({
        white_player_id: whitePlayer,
        black_player_id: blackPlayer,
        status: "waiting",
        scheduled_start: new Date(Date.now() + BATTLE_JOIN_WINDOW_SECONDS * 1000).toISOString(),
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        turn: "white",
        move_count: 0,
        time_control: GAME_TIME_CONTROL_MAP[challenge.time_control] || "blitz",
        initial_minutes: challenge.initial_minutes,
        increment_seconds: challenge.increment_seconds,
        white_clock_ms: challenge.initial_minutes * 60 * 1000,
        black_clock_ms: challenge.initial_minutes * 60 * 1000,
        rated: challenge.rated,
      })
      .select("id")
      .single();

    if (gameError || !game) {
      return NextResponse.json({ error: "Failed to create game" }, { status: 500 });
    }

    // Update challenge with game link (status already set to accepted by atomic claim)
    await admin
      .from("challenges")
      .update({ game_id: game.id })
      .eq("id", challengeId);

    // ── Notify the CHALLENGER their match is live ──
    // In-app notification (battles-style)
    try {
      await admin.from("notifications").insert({
        user_id: challenge.challenger_id,
        type: "challenge_accepted",
        title: "Match accepted!",
        body: `Your Quick Match was accepted — clocks wait up to 2 minutes for you to reach the board!`,
        data: { game_id: game.id, challenge_id: challengeId },
        read: false,
      });
    } catch {}

    // Push — the challenger is usually away from the app at this moment.
    try {
      const { data: acceptorProfile } = await admin.from("profiles")
        .select("username, display_name").eq("id", user.id).single();
      const acceptorName = acceptorProfile?.display_name || acceptorProfile?.username || "Your opponent";
      await sendPushToUsers(admin, [challenge.challenger_id],
        quickMatchAcceptedPayload(game.id, acceptorName),
        { notifKey: `challenge-accepted:${challenge.challenger_id}`, gapMin: 60 });
    } catch {}

    // Quick-Match interop: if the challenger is still sitting in the
    // matchmaking queue (their search auto-created this link), remove
    // their queue row — the DELETE fires their realtime listener and
    // redirects them straight into the new game. Same for the acceptor's
    // own queue entry, and cancel any other auto-posted announce links
    // for either player so nobody joins a stale match.
    await admin.from("matchmaking_queue").delete()
      .in("player_id", [challenge.challenger_id, user.id]);
    await admin.from("challenges").update({ status: "cancelled" })
      .eq("source", "quick_match_announce")
      .eq("status", "pending")
      .in("challenger_id", [challenge.challenger_id, user.id]);

    return NextResponse.json({ gameId: game.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
