import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTimeoutForGame } from "@/lib/game/resolve-timeout";
import { getAbortSeconds, REPLY_ABORT_SECONDS } from "@/lib/game/abort-config";
import { finalizeResign } from "@/lib/game/finalize-resign";
import { getAbandonedColor, shouldRefreshHeartbeat } from "@/lib/game/abandonment";

// Client-callable timeout check — verifies the current user is in the game.
// Polled every few seconds by both players' clients while a game is in
// progress, so whichever side is still connected can detect and resolve
// an opponent's expired clock (no-show -> abort, mid-game disconnect -> timeout loss).
//
// Also checks for first-move abort: if no move has been made within the
// abort threshold for this game mode, the game is aborted immediately
// (regardless of remaining clock time).
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    // Read the session locally (no network round trip). This endpoint is
    // polled every few seconds by every active player; getUser()'s auth
    // call was flooding Supabase during peak play. The user id comes from
    // the signed JWT, so membership checks below remain trustworthy.
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { gameId } = await req.json();
    if (!gameId) {
      return NextResponse.json({ error: "Game ID required" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: game } = await admin
      .from("games")
      .select("id, status, turn, move_count, white_clock_ms, black_clock_ms, last_move_at, created_at, white_player_id, black_player_id, white_rating, black_rating, rated, tournament_id, time_control, fen, white_last_seen, black_last_seen")
      .eq("id", gameId)
      .single();

    if (!game) {
      return NextResponse.json({ error: "Game not found" }, { status: 404 });
    }

    if (game.white_player_id !== user.id && game.black_player_id !== user.id) {
      return NextResponse.json({ error: "Not a player in this game" }, { status: 403 });
    }

    if (game.status !== "playing") {
      return NextResponse.json({ status: game.status, timedOut: false });
    }

    const now = Date.now();

    // ── Heartbeat: this poll doubles as the player's presence signal ────
    // The client polls every 4s while the game page is open. Refresh this
    // player's last_seen (throttled to one write per 15s) so that, if they
    // close the app / navigate away, their heartbeat goes silent and the
    // opponent's next poll auto-resigns them (2-minute abandonment rule).
    const isWhite = game.white_player_id === user.id;
    const myLastSeen = isWhite ? game.white_last_seen : game.black_last_seen;
    if (shouldRefreshHeartbeat(myLastSeen, now)) {
      await admin
        .from("games")
        .update(isWhite ? { white_last_seen: new Date().toISOString() } : { black_last_seen: new Date().toISOString() })
        .eq("id", game.id)
        .eq("status", "playing");
    }

    // ── Abandonment check: resign a player who's been silent 2+ minutes ──
    // Only the OPPONENT can be resigned here — the caller just refreshed
    // their own heartbeat above, so they're present by definition.
    const abandonedColor = getAbandonedColor(game, now);
    if (abandonedColor && abandonedColor !== (isWhite ? "white" : "black")) {
      const opponentId = isWhite ? game.black_player_id : game.white_player_id;
      const result = await finalizeResign({
        gameId: game.id,
        whitePlayerId: game.white_player_id,
        blackPlayerId: game.black_player_id,
        winner: isWhite ? "white" : "black",
        resignedPlayerId: opponentId,
        admin,
      });
      if (result.ok) {
        return NextResponse.json({ timedOut: true, status: "resign", winner: isWhite ? "white" : "black" });
      }
    }

    // ── Early-move no-show check (moves 0 AND 1) ───────────────────────
    // Mirrors the "must move" countdown shown in the game UI so the
    // countdown actually resolves when it hits zero (chess.com-style):
    //   move 0 (White hasn't opened): abort threshold for the time control
    //   move 1 (Black hasn't replied): REPLY_ABORT_SECONDS (2 minutes)
    // Casual games abort (no result, no rating change). Battles resolve
    // decisively via resolveTimeoutForGame (stakes in escrow). Tournament
    // games are excluded — the tournament cron has its own 2-minute
    // auto-resign rule that also advances brackets.
    if ((game.move_count === 0 || game.move_count === 1) && !game.tournament_id) {
      const thresholdSec =
        game.move_count === 0 ? getAbortSeconds(game.time_control) : REPLY_ABORT_SECONDS;
      const timerStart = new Date(game.last_move_at || game.created_at).getTime();
      const elapsedMs = now - timerStart;

      if (elapsedMs >= thresholdSec * 1000) {
        // Battles always resolve decisively — never abort with money in escrow
        const { data: battle } = await admin
          .from("battles")
          .select("id")
          .or(`game_id.eq.${game.id},armageddon_game_id.eq.${game.id}`)
          .in("status", ["playing", "draw_armageddon"])
          .limit(1)
          .maybeSingle();

        if (battle) {
          const result = await resolveTimeoutForGame(admin, game);
          return NextResponse.json({ timedOut: true, status: result.status, winner: result.winner });
        }

        // Casual game: abort with no winner and no rating change.
        // Atomic claim (.eq status "playing") so concurrent polls from
        // both players can't double-resolve.
        const { data: claimed } = await admin
          .from("games")
          .update({
            status: "abort",
            winner: null,
            ended_at: new Date().toISOString(),
          })
          .eq("id", game.id)
          .eq("status", "playing")
          .select("id")
          .maybeSingle();

        if (claimed) {
          return NextResponse.json({ timedOut: true, status: "abort", winner: null });
        }
      }
    }

    // ── Clock expiry check ──────────────────────────────────────────────
    // Clock starts as soon as the game transitions to "playing" (last_move_at
    // is set at that moment). No special-casing for move_count === 0.
    const lastMoveTime = new Date(game.last_move_at || game.created_at).getTime();
    const elapsedMs = now - lastMoveTime;
    const currentClockMs = game.turn === "white" ? game.white_clock_ms : game.black_clock_ms;
    const remainingMs = (currentClockMs ?? 0) - elapsedMs;

    if (remainingMs <= 0) {
      const result = await resolveTimeoutForGame(admin, game);
      return NextResponse.json({ timedOut: true, status: result.status, winner: result.winner });
    }

    return NextResponse.json({ timedOut: false, status: "playing" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Timeout check failed" }, { status: 500 });
  }
}
