import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSwissPairings, extractPreviousByes } from "@/lib/tournament/swiss-pairing";
import { roundAlreadyExists, atomicAdvanceRound } from "@/lib/tournament/guards";

// Can be triggered by cron-job.org or Vercel cron (with CRON_SECRET)
// Finds all active tournaments where the current round is complete and
// automatically advances to the next round (or finishes the tournament).
export async function POST(req: NextRequest) {
  return handleAutoAdvance(req);
}

// Also support GET so cron-job.org can use either method
export async function GET(req: NextRequest) {
  return handleAutoAdvance(req);
}

async function handleAutoAdvance(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!isCron) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Find all active tournaments
    const { data: tournaments } = await admin
      .from("tournaments")
      .select("id, name, status, current_round, rounds, type, time_control, initial_minutes, increment_seconds, rest_minutes, countdown_minutes")
      .eq("status", "active");

    if (!tournaments || tournaments.length === 0) {
      return NextResponse.json({ checked: 0, advanced: 0, finished: 0 });
    }

    let advanced = 0;
    let finished = 0;
    const errors: string[] = [];

    for (const tournament of tournaments) {
      try {
        // Check if current round is complete
        const { data: currentRound } = await admin
          .from("tournament_rounds")
          .select("id, is_complete, round_number")
          .eq("tournament_id", tournament.id)
          .eq("round_number", tournament.current_round)
          .single();

        if (!currentRound?.is_complete) continue;

        const nextRound = (tournament.current_round || 1) + 1;

        // If all rounds are done, finish the tournament
        if (tournament.rounds && nextRound > tournament.rounds) {
          await admin
            .from("tournaments")
            .update({ status: "finished", ended_at: new Date().toISOString() })
            .eq("id", tournament.id);

          const { data: participants } = await admin
            .from("tournament_participants")
            .select("player_id")
            .eq("tournament_id", tournament.id);

          for (const p of participants || []) {
            try {
              await admin.from("notifications").insert({
                user_id: p.player_id,
                type: "tournament_finished",
                title: `${tournament.name} has finished!`,
                body: `All rounds are complete. Check your final ranking on the tournament page.`,
                data: { tournamentName: tournament.name, tournamentId: tournament.id },
                read: false,
              });
            } catch {}
          }

          finished++;
          continue;
        }

        if (!tournament.rounds) continue; // Arena tournaments don't use rounds
        if (tournament.type === "knockout") continue; // Knockout tournaments need bracket advancement, not Swiss pairing

        // ── Generate next round Swiss pairings ──
        const { data: participants } = await admin
          .from("tournament_participants")
          .select("player_id, score, seed, wins, losses, draws, games_played")
          .eq("tournament_id", tournament.id)
          .order("score", { ascending: false })
          .order("seed", { ascending: true });

        if (!participants || participants.length === 0) {
          errors.push(`${tournament.name}: no participants`);
          continue;
        }

        const playerIds = participants.map((p) => p.player_id);
        const { data: profiles } = await admin
          .from("profiles")
          .select("id, rating")
          .in("id", playerIds);

        // Avoid rematches
        const { data: previousGames } = await admin
          .from("games")
          .select("white_player_id, black_player_id")
          .eq("tournament_id", tournament.id);
        const previousMatchups = new Set<string>();
        for (const g of previousGames || []) {
          previousMatchups.add(`${g.white_player_id}|${g.black_player_id}`);
          previousMatchups.add(`${g.black_player_id}|${g.white_player_id}`);
        }

        // Swiss pairing: sort by score, pair within groups, avoid rematches
        // Fetch previous byes to avoid repeat byes
        const { data: prevRounds } = await admin
          .from("tournament_rounds")
          .select("pairings")
          .eq("tournament_id", tournament.id);
        const previousByes = extractPreviousByes(prevRounds || []);

        const pairings = generateSwissPairings(
          participants.map((p: any) => ({ player_id: p.player_id, score: p.score || 0, seed: p.seed || 0 })),
          previousMatchups,
          previousByes,
        );

        // Calculate when next round games should start (now + rest minutes)
        const restMinutes = tournament.rest_minutes || 1;
        const scheduledStart = new Date(Date.now() + restMinutes * 60 * 1000);

        // Create round entry with scheduled start time
        // Guard: skip if round already exists (prevents duplicate game creation)
        if (await roundAlreadyExists(admin, tournament.id, nextRound)) {
          console.log(`[auto-advance] Round ${nextRound} already exists for tournament, skipping`);
          continue;
        }
                await admin.from("tournament_rounds").insert({
          tournament_id: tournament.id,
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

        // Split byes from matches for bulk insert
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
          increment_seconds: tournament.increment_seconds || 5,
          rated: false,
          tournament_id: tournament.id,
          tournament_round: nextRound,
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          turn: "white",
          move_count: 0,
          white_clock_ms: initialMs,
          black_clock_ms: initialMs,
          scheduled_start: scheduledStart.toISOString(),
        }));

        const writes: PromiseLike<any>[] = [];
        if (gameRows.length > 0) writes.push(admin.from("games").insert(gameRows));
        if (byePairings.length > 0) {
          writes.push(
            ...byePairings.map((p) =>
              admin.rpc("credit_tournament_bye", { p_tournament_id: tournament.id, p_player_id: p.bye })
            )
          );
        }
        await Promise.all(writes);

        // Notify all participants about upcoming round
        const allParticipants = participants.map((p) => p.player_id);
        await Promise.all(
          allParticipants.map((pid) =>
            admin.from("notifications").insert({
              user_id: pid,
              type: "round_starting",
              title: `Round ${nextRound} starts in ${restMinutes} minutes — ${tournament.name}`,
              body: `Get ready! Round ${nextRound} starts soon. Go to the tournament page and enter your game.`,
              data: { tournamentName: tournament.name, tournamentId: tournament.id, round: nextRound, startTime: scheduledStart.toISOString() },
              read: false,
            }).then(() => {}, () => {})
          )
        );

        // Update tournament current round
        const _advanced = await atomicAdvanceRound(admin, tournament.id, tournament.current_round || 1, nextRound);
          if (!_advanced) continue;

        // Notify participants
        for (const p of participants) {
          try {
            await admin.from("notifications").insert({
              user_id: p.player_id,
              type: "tournament_round",
              title: `Round ${nextRound} of ${tournament.name}`,
              body: `Your next game is ready! Round ${nextRound} has been paired.`,
              data: { tournamentName: tournament.name, tournamentId: tournament.id, round: nextRound },
              read: false,
            });
          } catch {}
        }

        advanced++;
      } catch (e: any) {
        errors.push(`${tournament.name}: ${e.message}`);
      }
    }

    return NextResponse.json({ checked: tournaments.length, advanced, finished, errors });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Auto-advance failed" }, { status: 500 });
  }
}
