import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Allow enough time for large tournaments (100+ players / ~50 games per round)
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: tournamentId } = await params;
    const admin = createAdminClient();

    const { data: tournament } = await admin
      .from("tournaments")
      .select("*")
      .eq("id", tournamentId)
      .single();

    if (!tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // Check authorization: admin OR tournament creator
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    const isAdmin = profile?.is_admin ?? false;
    const isCreator = tournament.created_by === user.id;

    if (!isAdmin && !isCreator) {
      return NextResponse.json({ error: "Only the tournament creator or an admin can manage the tournament" }, { status: 403 });
    }

    if (tournament.status !== "active") {
      return NextResponse.json({ error: "Tournament not active" }, { status: 400 });
    }

    const nextRound = (tournament.current_round || 1) + 1;

    if (tournament.rounds && nextRound > tournament.rounds) {
      // All rounds done — finish tournament
      await admin
        .from("tournaments")
        .update({ status: "finished", ended_at: new Date().toISOString() })
        .eq("id", tournamentId);

      return NextResponse.json({ success: true, finished: true });
    }

    if (!tournament.rounds) {
      return NextResponse.json({ error: "Arena tournaments don't use round advancement" }, { status: 400 });
    }

    // Check if current round is complete
    const { data: currentRound } = await admin
      .from("tournament_rounds")
      .select("is_complete")
      .eq("tournament_id", tournamentId)
      .eq("round_number", tournament.current_round)
      .single();

    if (!currentRound?.is_complete) {
      return NextResponse.json({ error: "Current round not complete" }, { status: 400 });
    }

    // Fetch participants sorted by score (then by seed for tiebreak)
    const { data: participants } = await admin
      .from("tournament_participants")
      .select("player_id, score, seed, wins, losses, draws, games_played")
      .eq("tournament_id", tournamentId)
      .order("score", { ascending: false })
      .order("seed", { ascending: true });

    if (!participants || participants.length === 0) {
      return NextResponse.json({ error: "No participants" }, { status: 400 });
    }

    // Fetch ratings for game creation
    const playerIds = participants.map((p) => p.player_id);
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, rating")
      .in("id", playerIds);

    // Fetch previous pairings to avoid rematches
    const { data: previousGames } = await admin
      .from("games")
      .select("white_player_id, black_player_id")
      .eq("tournament_id", tournamentId);
    const previousMatchups = new Set<string>();
    for (const g of previousGames || []) {
      previousMatchups.add(`${g.white_player_id}|${g.black_player_id}`);
      previousMatchups.add(`${g.black_player_id}|${g.white_player_id}`);
    }

    // Swiss pairing for next round:
    // Group by score, pair within score groups, avoid rematches
    const pairings: Array<{ white: string; black: string; bye?: string }> = [];
    const used = new Set<string>();

    // Sort by score descending, then by seed for tiebreak
    const sorted = [...participants].sort((a, b) => (b.score || 0) - (a.score || 0) || (a.seed || 0) - (b.seed || 0));

    for (let i = 0; i < sorted.length; i++) {
      if (used.has(sorted[i].player_id)) continue;

      let paired = false;
      for (let j = i + 1; j < sorted.length; j++) {
        if (used.has(sorted[j].player_id)) continue;

        // Skip if these players have already been paired in this tournament
        const key = `${sorted[i].player_id}|${sorted[j].player_id}`;
        if (previousMatchups.has(key)) continue;

        pairings.push({
          white: sorted[i].player_id,
          black: sorted[j].player_id,
        });
        used.add(sorted[i].player_id);
        used.add(sorted[j].player_id);
        paired = true;
        break;
      }

      if (!paired) {
        // Bye
        pairings.push({ white: "", black: "", bye: sorted[i].player_id });
        used.add(sorted[i].player_id);
      }
    }

    // Calculate when next round games should start (now + rest minutes)
    const restMinutes = tournament.rest_minutes || 5;
    const scheduledStart = new Date(Date.now() + restMinutes * 60 * 1000);

    // Create round entry with scheduled start time
    await admin.from("tournament_rounds").insert({
      tournament_id: tournamentId,
      round_number: nextRound,
      pairings: pairings.map((p, i) => ({
        board: i + 1,
        white: p.white || null,
        black: p.black || null,
        bye: p.bye || null,
        result: null,
      })),
      is_complete: false,
      starts_at: scheduledStart.toISOString(),
    });

    // Split byes from real matches so we bulk-insert games in ONE call
    // instead of N sequential inserts (matters once a round has 25-50+ boards).
    const byePairings = pairings.filter((p) => p.bye);
    const matchPairings = pairings.filter((p) => !p.bye);

    const initialMs = tournament.initial_minutes * 60 * 1000;

    const gameRows = matchPairings.map((pairing) => ({
      white_player_id: pairing.white,
      black_player_id: pairing.black,
      white_rating: profiles?.find((p: any) => p.id === pairing.white)?.rating || 1200,
      black_rating: profiles?.find((p: any) => p.id === pairing.black)?.rating || 1200,
      status: "waiting",
      time_control: tournament.time_control,
      initial_minutes: tournament.initial_minutes,
      increment_seconds: tournament.increment_seconds,
      rated: false,
      tournament_id: tournamentId,
      tournament_round: nextRound,
      fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      turn: "white",
      move_count: 0,
      white_clock_ms: initialMs,
      black_clock_ms: initialMs,
      scheduled_start: scheduledStart.toISOString(),
    }));

    const writes: PromiseLike<any>[] = [];

    if (gameRows.length > 0) {
      writes.push(admin.from("games").insert(gameRows));
    }

    if (byePairings.length > 0) {
      writes.push(
        ...byePairings.map((p) => {
          const byeParticipant = participants.find((pp) => pp.player_id === p.bye);
          return admin
            .from("tournament_participants")
            .update({
              score: (byeParticipant?.score || 0) + 1,
              wins: (byeParticipant?.wins || 0) + 1,
              games_played: (byeParticipant?.games_played || 0) + 1,
            })
            .eq("player_id", p.bye)
            .eq("tournament_id", tournamentId);
        })
      );
    }

    const writeResults = await Promise.all(writes);
    const writeError = writeResults.find((r: any) => r?.error)?.error;
    if (writeError) {
      console.error("Round game/bye creation error:", writeError);
    }

    // Notify all participants about upcoming round
    await Promise.all(
      participants.map((p) =>
        admin.from("notifications").insert({
          user_id: p.player_id,
          type: "round_starting",
          title: `Round ${nextRound} starts in ${restMinutes} minutes — ${tournament.name}`,
          body: `Get ready! Round ${nextRound} starts soon. Go to the tournament page and enter your game.`,
          data: { tournamentName: tournament.name, tournamentId, round: nextRound, startTime: scheduledStart.toISOString() },
          read: false,
        }).then(() => {}, () => {})
      )
    );

    // Update tournament current round
    await admin
      .from("tournaments")
      .update({ current_round: nextRound })
      .eq("id", tournamentId);

    return NextResponse.json({ success: true, round: nextRound, pairings: pairings.length, scheduledStart: scheduledStart.toISOString(), restMinutes });
  } catch (e: any) {
    console.error("Advance round error:", e);
    return NextResponse.json({ error: e.message || "Failed to advance round" }, { status: 500 });
  }
}
