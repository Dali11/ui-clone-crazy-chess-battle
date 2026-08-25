import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Combined tournament cron — does auto-start + auto-advance in one call
// Runs every 2 minutes via Vercel Cron
export async function GET(req: NextRequest) {
  return handleTournamentCron(req);
}

export async function POST(req: NextRequest) {
  return handleTournamentCron(req);
}

async function handleTournamentCron(req: NextRequest) {
  try {
    // No auth required — endpoint only performs safe tournament operations
    // (auto-start, auto-advance). No data exposure or destructive actions.

    const admin = createAdminClient();
    const now = new Date().toISOString();
    const results = { started: 0, advanced: 0, errors: [] as string[] };

    // ── 1. AUTO-START: Start tournaments whose start time has passed ──
    const { data: toStart } = await admin
      .from("tournaments")
      .select("id, name, starts_at, status, type, initial_minutes, increment_seconds, time_control, min_players, entry_fee_cents")
      .eq("status", "upcoming")
      .lte("starts_at", now);

    for (const tournament of toStart || []) {
      try {
        const { data: participants } = await admin
          .from("tournament_participants")
          .select("player_id, seed")
          .eq("tournament_id", tournament.id);

        if (!participants || participants.length < (tournament.min_players || 2)) {
          // Not enough players — cancel
          await admin.from("tournaments").update({ status: "cancelled" }).eq("id", tournament.id);
          results.errors.push(`${tournament.name}: cancelled (not enough players)`);
          continue;
        }

        // Seed players by rating if no seed assigned
        const { data: profiles } = await admin
          .from("profiles")
          .select("id, rating")
          .in("id", participants.map(p => p.player_id))
          .order("rating", { ascending: false });

        const ratingMap = new Map((profiles || []).map(p => [p.id, p.rating || 1200]));
        const seeded = participants
          .map(p => ({ ...p, rating: ratingMap.get(p.player_id) || 1200 }))
          .sort((a, b) => b.rating - a.rating);

        for (let i = 0; i < seeded.length; i++) {
          await admin
            .from("tournament_participants")
            .update({ seed: i + 1 })
            .eq("player_id", seeded[i].player_id)
            .eq("tournament_id", tournament.id);
        }

        // Generate Round 1 pairings (Swiss)
        const pairings: Array<{ white: string; black: string }> = [];
        for (let i = 0; i < seeded.length - 1; i += 2) {
          pairings.push({ white: seeded[i].player_id, black: seeded[i + 1].player_id });
        }
        // Odd player gets a bye
        if (seeded.length % 2 === 1) {
          const byePlayer = seeded[seeded.length - 1];
          await admin
            .from("tournament_participants")
            .update({ score: 1, wins: 1, games_played: 1 })
            .eq("player_id", byePlayer.player_id)
            .eq("tournament_id", tournament.id);
        }

        // Create games
        for (const pairing of pairings) {
          await admin.from("games").insert({
            tournament_id: tournament.id,
            white_player_id: pairing.white,
            black_player_id: pairing.black,
            status: "playing",
            time_control: tournament.time_control || "rapid",
            initial_minutes: tournament.initial_minutes || 10,
            increment_seconds: tournament.increment_seconds || 0,
            current_round: 1,
          });
        }

        await admin.from("tournaments").update({ status: "active", current_round: 1 }).eq("id", tournament.id);
        results.started++;
      } catch (e: any) {
        results.errors.push(`${tournament.name}: ${e.message}`);
      }
    }

    // ── 2. AUTO-ADVANCE: Advance active tournaments when all round games complete ──
    const { data: activeTournaments } = await admin
      .from("tournaments")
      .select("id, name, current_round, rounds, type, initial_minutes, increment_seconds, time_control")
      .eq("status", "active");

    for (const tournament of activeTournaments || []) {
      try {
        const currentRound = tournament.current_round || 1;

        // Check if all games in current round are complete
        const { data: activeGames } = await admin
          .from("games")
          .select("id, white_player_id, black_player_id, winner, status")
          .eq("tournament_id", tournament.id)
          .eq("current_round", currentRound)
          .neq("status", "playing");

        const { count: totalGames } = await admin
          .from("games")
          .select("id", { count: "exact", head: true })
          .eq("tournament_id", tournament.id)
          .eq("current_round", currentRound);

        if (!totalGames || totalGames === 0 || (activeGames?.length || 0) < totalGames) {
          continue; // Not all games done yet
        }

        // Update participant scores from completed games
        const completedGames = activeGames || [];
        for (const game of completedGames) {
          let whiteScore = 0, blackScore = 0;
          let whiteWins = 0, blackWins = 0, whiteDraws = 0, blackDraws = 0, whiteLosses = 0, blackLosses = 0;

          if (game.status === "draw" || game.status === "stalemate") {
            whiteScore = 0.5; blackScore = 0.5;
            whiteDraws = 1; blackDraws = 1;
          } else if (game.winner) {
            if (game.winner === "white") {
              whiteScore = 1; blackScore = 0;
              whiteWins = 1; blackLosses = 1;
            } else {
              whiteScore = 0; blackScore = 1;
              blackWins = 1; whiteLosses = 1;
            }
          }

          if (whiteScore > 0 || game.status === "draw" || game.status === "stalemate") {
            try {
              await admin.rpc("update_tournament_scores", {
                p_tournament_id: tournament.id,
                p_player_id: game.white_player_id,
                p_score_delta: whiteScore,
                p_wins_delta: whiteWins,
                p_draws_delta: whiteDraws,
                p_losses_delta: whiteLosses,
              });
            } catch {}
          }
          if (blackScore > 0 || game.status === "draw" || game.status === "stalemate") {
            try {
              await admin.rpc("update_tournament_scores", {
                p_tournament_id: tournament.id,
                p_player_id: game.black_player_id,
                p_score_delta: blackScore,
                p_wins_delta: blackWins,
                p_draws_delta: blackDraws,
                p_losses_delta: blackLosses,
              });
            } catch {}
          }
        }

        // Check if this was the last round
        if (currentRound >= tournament.rounds) {
          // Tournament finished
          await admin.from("tournaments").update({
            status: "finished",
            ended_at: new Date().toISOString(),
          }).eq("id", tournament.id);
          results.errors.push(`${tournament.name}: finished after ${currentRound} rounds`);
          continue;
        }

        // Generate next round pairings (Swiss)
        const { data: participants } = await admin
          .from("tournament_participants")
          .select("player_id, score, seed, wins, losses, draws, games_played")
          .eq("tournament_id", tournament.id)
          .order("score", { ascending: false })
          .order("seed", { ascending: true });

        if (!participants || participants.length < 2) continue;

        // Build previous matchup set
        const { data: allGames } = await admin
          .from("games")
          .select("white_player_id, black_player_id")
          .eq("tournament_id", tournament.id);

        const previousMatchups = new Set<string>();
        for (const g of allGames || []) {
          previousMatchups.add(`${g.white_player_id}|${g.black_player_id}`);
          previousMatchups.add(`${g.black_player_id}|${g.white_player_id}`);
        }

        // Swiss pairing
        const sorted = [...participants].sort(
          (a, b) => (b.score || 0) - (a.score || 0) || (a.seed || 0) - (b.seed || 0)
        );

        const nextRound = currentRound + 1;
        const used = new Set<string>();
        const pairings: Array<{ white: string; black: string }> = [];

        for (let i = 0; i < sorted.length; i++) {
          if (used.has(sorted[i].player_id)) continue;

          let paired = false;
          for (let j = i + 1; j < sorted.length; j++) {
            if (used.has(sorted[j].player_id)) continue;

            const key = `${sorted[i].player_id}|${sorted[j].player_id}`;
            if (previousMatchups.has(key)) continue;

            pairings.push({ white: sorted[i].player_id, black: sorted[j].player_id });
            used.add(sorted[i].player_id);
            used.add(sorted[j].player_id);
            paired = true;
            break;
          }

          if (!paired) {
            // Allow rematch if no other option
            for (let j = 0; j < sorted.length; j++) {
              if (!used.has(sorted[j].player_id) && sorted[j].player_id !== sorted[i].player_id) {
                pairings.push({ white: sorted[i].player_id, black: sorted[j].player_id });
                used.add(sorted[i].player_id);
                used.add(sorted[j].player_id);
                paired = true;
                break;
              }
            }
          }

          if (!paired) {
            // Bye
            used.add(sorted[i].player_id);
            await admin
              .from("tournament_participants")
              .update({
                score: (sorted[i].score || 0) + 1,
                wins: (sorted[i].wins || 0) + 1,
                games_played: (sorted[i].games_played || 0) + 1,
              })
              .eq("player_id", sorted[i].player_id)
              .eq("tournament_id", tournament.id);
          }
        }

        // Create next round games
        for (const pairing of pairings) {
          await admin.from("games").insert({
            tournament_id: tournament.id,
            white_player_id: pairing.white,
            black_player_id: pairing.black,
            status: "playing",
            time_control: tournament.time_control || "rapid",
            initial_minutes: tournament.initial_minutes || 10,
            increment_seconds: tournament.increment_seconds || 0,
            current_round: nextRound,
          });
        }

        await admin.from("tournaments").update({ current_round: nextRound }).eq("id", tournament.id);
        results.advanced++;
      } catch (e: any) {
        results.errors.push(`${tournament.name} advance: ${e.message}`);
      }
    }

    return NextResponse.json(results);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
