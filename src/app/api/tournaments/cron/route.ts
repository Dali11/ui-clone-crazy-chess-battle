import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Combined tournament cron — does auto-start + auto-advance in one call.
// Runs every 5 minutes via Base44 workflow (backend function trigger).
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
    const results = { started: 0, advanced: 0, finished: 0, errors: [] as string[] };

    // ── 1. AUTO-START: Start tournaments whose start time has passed ──
    const { data: toStart } = await admin
      .from("tournaments")
      .select("id, name, starts_at, status, type, initial_minutes, increment_seconds, time_control, min_players, entry_fee_cents, max_players, rest_minutes, countdown_minutes")
      .eq("status", "upcoming")
      .lte("starts_at", now);

    for (const tournament of toStart || []) {
      try {
        const { data: participants } = await admin
          .from("tournament_participants")
          .select("player_id, seed")
          .eq("tournament_id", tournament.id);

        if (!participants || participants.length < (tournament.min_players || 2)) {
          await admin.from("tournaments").update({ status: "cancelled" }).eq("id", tournament.id);
          results.errors.push(`${tournament.name}: cancelled (not enough players)`);
          continue;
        }

        // Seed players by rating (highest first)
        const { data: profiles } = await admin
          .from("profiles")
          .select("id, rating")
          .in("id", participants.map((p: any) => p.player_id));

        const ratingMap = new Map((profiles || []).map((p: any) => [p.id, p.rating || 1200]));
        const seeded = participants
          .map((p: any) => ({ ...p, rating: ratingMap.get(p.player_id) || 1200 }))
          .sort((a: any, b: any) => b.rating - a.rating);

        await Promise.all(
          seeded.map((s: any, i: number) =>
            admin
              .from("tournament_participants")
              .update({ seed: i + 1 })
              .eq("player_id", s.player_id)
              .eq("tournament_id", tournament.id)
          )
        );

        // Generate Round 1 pairings — proper Swiss: top half vs bottom half
        const pairings: Array<{ white: string; black: string; bye?: string }> = [];
        const mid = Math.ceil(seeded.length / 2);
        const topHalf = seeded.slice(0, mid);
        const bottomHalf = seeded.slice(mid);

        for (let i = 0; i < mid; i++) {
          if (i < bottomHalf.length) {
            const white = i % 2 === 0 ? topHalf[i].player_id : bottomHalf[i].player_id;
            const black = i % 2 === 0 ? bottomHalf[i].player_id : topHalf[i].player_id;
            pairings.push({ white, black });
          } else {
            pairings.push({ white: "", black: "", bye: topHalf[i].player_id });
          }
        }

        // Create tournament round entry
        const countdownMin1 = tournament.countdown_minutes || 2;
        const r1Start = new Date(Date.now() + countdownMin1 * 60 * 1000);

        await admin.from("tournament_rounds").insert({
          tournament_id: tournament.id,
          round_number: 1,
          pairings: pairings.map((p, i) => ({
            board: i + 1,
            white: p.white || null,
            black: p.black || null,
            bye: p.bye || null,
            result: null,
          })),
          is_complete: false,
          starts_at: r1Start.toISOString(),
        });

        // Split byes from matches for bulk insert
        const byePairings = pairings.filter((p) => p.bye);
        const matchPairings = pairings.filter((p) => !p.bye);
        const initialMs = (tournament.initial_minutes || 10) * 60 * 1000;

        const gameRows = matchPairings.map((pairing) => ({
          white_player_id: pairing.white,
          black_player_id: pairing.black,
          white_rating: ratingMap.get(pairing.white) || 1200,
          black_rating: ratingMap.get(pairing.black) || 1200,
          status: "waiting",
          time_control: tournament.time_control || "rapid",
          initial_minutes: tournament.initial_minutes || 10,
          increment_seconds: tournament.increment_seconds || 0,
          rated: false,
          tournament_id: tournament.id,
          tournament_round: 1,
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          turn: "white",
          move_count: 0,
          white_clock_ms: initialMs,
          black_clock_ms: initialMs,
          scheduled_start: r1Start.toISOString(),
        }));

        // Insert games and get back their IDs
        let createdGameIds: Record<string, string> = {};
        if (gameRows.length > 0) {
          const { data: insertedGames } = await admin
            .from("games")
            .insert(gameRows)
            .select("id, white_player_id, black_player_id");
          for (const g of insertedGames || []) {
            createdGameIds[`${g.white_player_id}|${g.black_player_id}`] = g.id;
          }
        }

        // Update round pairings with game_id
        const pairingsWithGameIds = pairings.map((p, i) => ({
          board: i + 1,
          white: p.white || null,
          black: p.black || null,
          bye: p.bye || null,
          result: null,
          game_id: createdGameIds[`${p.white}|${p.black}`] || null,
        }));
        await admin
          .from("tournament_rounds")
          .update({ pairings: pairingsWithGameIds })
          .eq("tournament_id", tournament.id)
          .eq("round_number", 1);

        // Handle byes
        if (byePairings.length > 0) {
          await Promise.all(
            byePairings.map((p) =>
              admin
                .from("tournament_participants")
                .update({ score: 1, wins: 1, games_played: 1 })
                .eq("player_id", p.bye!)
                .eq("tournament_id", tournament.id)
            )
          );
        }

        await admin.from("tournaments").update({ status: "active", current_round: 1 }).eq("id", tournament.id);
        results.started++;
      } catch (e: any) {
        results.errors.push(`${tournament.name}: ${e.message}`);
      }
    }

    // ── 2. AUTO-ADVANCE: Advance when current round is complete ──
    const { data: activeTournaments } = await admin
      .from("tournaments")
      .select("id, name, current_round, rounds, type, time_control, initial_minutes, increment_seconds, rest_minutes, countdown_minutes")
      .eq("status", "active");

    for (const tournament of activeTournaments || []) {
      try {
        const currentRound = tournament.current_round || 1;

        const { data: round } = await admin
          .from("tournament_rounds")
          .select("id, is_complete")
          .eq("tournament_id", tournament.id)
          .eq("round_number", currentRound)
          .single();

        if (!round?.is_complete) continue;

        // Last round? processTournamentGameResult already finishes it, but double-check
        if (tournament.rounds && currentRound >= tournament.rounds) {
          await admin.from("tournaments").update({ status: "finished", ended_at: new Date().toISOString() }).eq("id", tournament.id);
          results.finished++;
          continue;
        }

        if (!tournament.rounds) continue;

        const nextRound = currentRound + 1;

        const { data: participants } = await admin
          .from("tournament_participants")
          .select("player_id, score, seed, wins, losses, draws, games_played")
          .eq("tournament_id", tournament.id)
          .order("score", { ascending: false })
          .order("seed", { ascending: true });

        if (!participants || participants.length < 2) continue;

        const playerIds = participants.map((p: any) => p.player_id);
        const { data: profiles } = await admin.from("profiles").select("id, rating").in("id", playerIds);

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

        // Buchholz tiebreak sorting
        const scoreLookup: Record<string, number> = {};
        for (const p of participants) scoreLookup[(p as any).player_id] = (p as any).score || 0;
        const { data: allGames } = await admin
          .from("games")
          .select("white_player_id, black_player_id")
          .eq("tournament_id", tournament.id);
        const oppScores: Record<string, number[]> = {};
        for (const g of allGames || []) {
          (oppScores[g.white_player_id] ||= []).push(scoreLookup[g.black_player_id] || 0);
          (oppScores[g.black_player_id] ||= []).push(scoreLookup[g.white_player_id] || 0);
        }
        const buchholz = (pid: string) => {
          const scores = [...(oppScores[pid] || [])].sort((a, b) => a - b);
          return scores.length > 1 ? scores.slice(1).reduce((s, v) => s + v, 0) : (scores[0] || 0);
        };

        const sorted = [...participants].sort(
          (a: any, b: any) =>
            (b.score || 0) - (a.score || 0) ||
            buchholz(b.player_id) - buchholz(a.player_id) ||
            (a.seed || 0) - (b.seed || 0)
        );

        const pairings: Array<{ white: string; black: string; bye?: string }> = [];
        const used = new Set<string>();

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
            pairings.push({ white: "", black: "", bye: sorted[i].player_id });
            used.add(sorted[i].player_id);
          }
        }

        const restMin = tournament.rest_minutes || 5;
        const rnStart = new Date(Date.now() + restMin * 60 * 1000);

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
          starts_at: rnStart.toISOString(),
        });

        const byePairings = pairings.filter((p) => p.bye);
        const matchPairings = pairings.filter((p) => !p.bye);
        const initialMs = (tournament.initial_minutes || 10) * 60 * 1000;

        const gameRows = matchPairings.map((pairing) => ({
          white_player_id: pairing.white,
          black_player_id: pairing.black,
          white_rating: profiles?.find((p: any) => p.id === pairing.white)?.rating || 1200,
          black_rating: profiles?.find((p: any) => p.id === pairing.black)?.rating || 1200,
          status: "waiting",
          time_control: tournament.time_control || "rapid",
          initial_minutes: tournament.initial_minutes || 10,
          increment_seconds: tournament.increment_seconds || 0,
          rated: false,
          tournament_id: tournament.id,
          tournament_round: nextRound,
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          turn: "white",
          move_count: 0,
          white_clock_ms: initialMs,
          black_clock_ms: initialMs,
          scheduled_start: rnStart.toISOString(),
        }));

        // Insert games and get back their IDs
        let createdGameIds: Record<string, string> = {};
        if (gameRows.length > 0) {
          const { data: insertedGames } = await admin
            .from("games")
            .insert(gameRows)
            .select("id, white_player_id, black_player_id");
          for (const g of insertedGames || []) {
            createdGameIds[`${g.white_player_id}|${g.black_player_id}`] = g.id;
          }
        }

        // Update round pairings with game_id
        const pairingsWithGameIds = pairings.map((p, i) => ({
          board: i + 1,
          white: p.white || null,
          black: p.black || null,
          bye: p.bye || null,
          result: null,
          game_id: createdGameIds[`${p.white}|${p.black}`] || null,
        }));
        await admin
          .from("tournament_rounds")
          .update({ pairings: pairingsWithGameIds })
          .eq("tournament_id", tournament.id)
          .eq("round_number", nextRound);

        // Handle byes
        if (byePairings.length > 0) {
          await Promise.all(
            byePairings.map((p) => {
              const byeP = participants.find((pp: any) => pp.player_id === p.bye);
              return admin
                .from("tournament_participants")
                .update({
                  score: ((byeP as any)?.score || 0) + 1,
                  wins: ((byeP as any)?.wins || 0) + 1,
                  games_played: ((byeP as any)?.games_played || 0) + 1,
                })
                .eq("player_id", p.bye!)
                .eq("tournament_id", tournament.id);
            })
          );
        }

        await admin.from("tournaments").update({ current_round: nextRound }).eq("id", tournament.id);

        // Notify participants
        for (const p of participants) {
          try {
            await admin.from("notifications").insert({
              user_id: (p as any).player_id,
              type: "tournament_round",
              title: `Round ${nextRound} of ${tournament.name}`,
              body: `Your next game is ready! Round ${nextRound} has been paired.`,
              data: { tournamentName: tournament.name, tournamentId: tournament.id, round: nextRound },
              read: false,
            });
          } catch {}
        }

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
