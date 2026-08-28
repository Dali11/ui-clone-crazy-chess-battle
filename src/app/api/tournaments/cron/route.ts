import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateSwissPairings, extractPreviousByes } from "@/lib/tournament/swiss-pairing";
import { shouldArenaFinish, runArenaMatchmakingWave } from "@/lib/tournament/arena";
import { processTournamentGameResult } from "@/lib/tournament/results";
import { finishTournament } from "@/lib/tournament/finish";
import { sendEmail } from "@/lib/email";
import { generateKnockoutBracket, knockoutRoundCount, advanceKnockoutRound, generateGroups, generateGroupRoundRobin, getGroupAdvancers, isKnockoutComplete } from "@/lib/tournament/knockout";

// Combined tournament cron — does auto-start + auto-advance + start-scheduled in one call.
// Triggered by Base44 workflow (every 5 min) or cron-job.org. No auth required.
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
      .select("id, name, starts_at, status, type, knockout_format, group_schedule, initial_minutes, increment_seconds, time_control, min_players, entry_fee, max_players, rest_minutes, countdown_minutes, duration_minutes")
      .eq("status", "upcoming")
      .lte("starts_at", now);

    // DEBUG: also fetch all upcoming tournaments (regardless of starts_at)
    // and all non-completed tournaments to diagnose auto-start failures
    const { data: allUpcoming } = await admin
      .from("tournaments")
      .select("id, name, starts_at, status, min_players")
      .eq("status", "upcoming")
      .order("starts_at", { ascending: true })
      .limit(10);
    const { data: allOther } = await admin
      .from("tournaments")
      .select("id, name, starts_at, status, min_players")
      .in("status", ["pending_approval", "active", "cancelled"])
      .order("starts_at", { ascending: true })
      .limit(10);
    (results as any)._debug = {
      now,
      upcomingReadyToStart: (toStart || []).map((t: any) => ({ id: t.id, name: t.name, starts_at: t.starts_at })),
      allUpcoming: (allUpcoming || []).map((t: any) => ({ id: t.id, name: t.name, starts_at: t.starts_at, min_players: t.min_players })),
      otherStatuses: (allOther || []).map((t: any) => ({ id: t.id, name: t.name, starts_at: t.starts_at, status: t.status })),
    };

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

        // Generate Round 1 pairings based on tournament type
        let pairings: Array<{ white: string; black: string; bye?: string; group?: number }> = [];
        let totalRounds: number | null = null;

        if (tournament.type === "knockout") {
          const seedPlayers = seeded.map((s: any, i: number) => ({ player_id: s.player_id, rating: s.rating, seed: i + 1 }));
          const koFormat = tournament.knockout_format || "pure";

          if (koFormat === "group_stage") {
            // Group stage → knockout: generate round-robin groups
            const groupSize = 4;
            const assignments = generateGroups(seedPlayers, groupSize);
            const groupMap = new Map<number, string[]>();
            for (const a of assignments) {
              if (!groupMap.has(a.group)) groupMap.set(a.group, []);
              groupMap.get(a.group)!.push(a.player_id);
            }

            // Generate full group schedule
            const numGroupRounds = Math.max(...Array.from(groupMap.values()).map(p => generateGroupRoundRobin(p).length));
            const groupSchedule: Array<{ round: number; pairings: Array<any> }> = [];
            for (let r = 0; r < numGroupRounds; r++) {
              const roundPairings: Array<any> = [];
              for (const [groupNum, groupPlayers] of groupMap) {
                const rr = generateGroupRoundRobin(groupPlayers);
                if (rr[r]) {
                  for (const p of rr[r]) {
                    roundPairings.push({ ...p, group: groupNum });
                  }
                }
              }
              groupSchedule.push({ round: r + 1, pairings: roundPairings });
            }

            // Save group schedule to tournament
            const knockoutRounds = knockoutRoundCount(
              Array.from(groupMap.values()).reduce((acc, g) => acc + Math.min(g.length, 2), 0)
            );
            totalRounds = groupSchedule.length + knockoutRounds;
            await admin.from("tournaments").update({
              group_schedule: groupSchedule,
              rounds: totalRounds,
            }).eq("id", tournament.id);

            // Use round 1 pairings from group schedule
            const round1 = groupSchedule[0]?.pairings || [];
            for (const p of round1) {
              pairings.push({ white: p.white, black: p.black, bye: p.bye, group: p.group });
            }
          } else {
            // Pure knockout
            const bracket = generateKnockoutBracket(seedPlayers);
            totalRounds = knockoutRoundCount(seeded.length);
            for (const p of bracket) {
              pairings.push({ white: p.white, black: p.black, bye: p.bye });
            }
            await admin.from("tournaments").update({ rounds: totalRounds }).eq("id", tournament.id);
          }
        } else if (tournament.type === "arena") {
          // Arena: pair by rating, set ends_at from duration
          const mid = Math.ceil(seeded.length / 2);
          const topHalf = seeded.slice(0, mid);
          const bottomHalf = seeded.slice(mid);
          for (let i = 0; i < mid; i++) {
            if (i < bottomHalf.length) {
              const white = i % 2 === 0 ? topHalf[i].player_id : bottomHalf[i].player_id;
              const black = i % 2 === 0 ? bottomHalf[i].player_id : topHalf[i].player_id;
              pairings.push({ white, black });
            }
          }
          // No byes in arena
          const durMin = (tournament as any).duration_minutes || 60;
          const endsAt = new Date(new Date(tournament.starts_at || Date.now()).getTime() + durMin * 60 * 1000);
          await admin.from("tournaments").update({ rounds: null, ends_at: endsAt.toISOString() }).eq("id", tournament.id);
        } else {
          // Swiss pairing: top half vs bottom half
          const swissRounds = Math.max(3, Math.ceil(Math.log2(seeded.length)));
          await admin.from("tournaments").update({ rounds: swissRounds }).eq("id", tournament.id);

          // If odd number of players, give the bye to the lowest seed
          const hasOddCount = seeded.length % 2 === 1;
          const byePlayer = hasOddCount ? seeded[seeded.length - 1].player_id : null;
          const paired = hasOddCount ? seeded.slice(0, -1) : seeded;
          const mid = Math.ceil(paired.length / 2);
          const topHalf = paired.slice(0, mid);
          const bottomHalf = paired.slice(mid);
          for (let i = 0; i < mid; i++) {
            if (i < bottomHalf.length) {
              const white = i % 2 === 0 ? topHalf[i].player_id : bottomHalf[i].player_id;
              const black = i % 2 === 0 ? bottomHalf[i].player_id : topHalf[i].player_id;
              pairings.push({ white, black });
            }
          }
          if (byePlayer) {
            pairings.push({ white: "", black: "", bye: byePlayer });
          }
        }

        // Create tournament round entry (skip for arena)
        const countdownMin1 = tournament.countdown_minutes || 2;
        const r1Start = new Date(Date.now() + countdownMin1 * 60 * 1000);

        if (tournament.type !== "arena") {
          await admin.from("tournament_rounds").insert({
            tournament_id: tournament.id,
            round_number: 1,
            pairings: pairings.map((p, i) => ({
              board: i + 1,
              white: p.white || null,
              black: p.black || null,
              bye: p.bye || null,
              result: null,
              group: (p as any).group ?? null,
            })),
            is_complete: false,
            starts_at: r1Start.toISOString(),
          });
        }

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

        // Update round pairings with game_id (skip for arena)
        if (tournament.type !== "arena") {
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
        }

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

    // ── 1B. ARENA: Continuous matchmaking + time-based finish ──
    const { data: arenaTournaments } = await admin
      .from("tournaments")
      .select("id, name, current_round, ends_at, time_control, initial_minutes, increment_seconds, duration_minutes, type, status")
      .eq("status", "active")
      .eq("type", "arena");

    for (const tournament of arenaTournaments || []) {
      try {
        // Check if time's up
        if (shouldArenaFinish(tournament)) {
          // Abort any in-progress games before finishing
          const { data: activeArenaGames } = await admin
            .from("games")
            .select("id, white_player_id, black_player_id")
            .eq("tournament_id", tournament.id)
            .in("status", ["waiting", "playing", "pending"]);

          for (const g of activeArenaGames || []) {
            await admin.from("games")
              .update({ status: "aborted", abort_reason: "Tournament time expired" })
              .eq("id", g.id);
          }

          await finishTournament(tournament.id);
          results.finished++;
          continue;
        }

        // ── No-show auto-resign: if a game has been "playing" with no move
        // from the player whose turn it is for 2+ minutes, they lose by
        // resignation. Applies to BOTH first moves — white not moving at all
        // (move_count=0) AND black not responding to white's first move
        // (move_count=1). The opponent gets the win and both are freed for
        // re-pairing.
        const { data: noShowGames } = await admin
          .from("games")
          .select("id, turn, move_count, white_player_id, black_player_id, white_rating, black_rating, rated, last_move_at, created_at")
          .eq("tournament_id", tournament.id)
          .eq("status", "playing")
          .in("move_count", [0, 1]);

        const NO_SHOW_MS = 2 * 60 * 1000; // 2 minutes
        for (const g of noShowGames || []) {
          // For move_count=0, measure from game start (white's first move).
          // For move_count=1, measure from white's last move (black's first move).
          const timerStart = g.move_count === 0
            ? new Date(g.last_move_at || g.created_at).getTime()
            : new Date(g.last_move_at || g.created_at).getTime();
          if (Date.now() - timerStart < NO_SHOW_MS) continue;

          // The player whose turn it is = the no-show loser
          const loser = g.turn; // "white" on first move
          const winner = loser === "white" ? "black" : "white";
          const loserId = loser === "white" ? g.white_player_id : g.black_player_id;
          const winnerId = winner === "white" ? g.white_player_id : g.black_player_id;

          await admin.from("games")
            .update({
              status: "resigned",
              winner: winner,
              ended_at: new Date().toISOString(),
            })
            .eq("id", g.id);

          // Process as a tournament game result so scores/streaks update
          await processTournamentGameResult({
            gameId: g.id,
            whitePlayerId: g.white_player_id,
            blackPlayerId: g.black_player_id,
            winner: winner as "white" | "black",
            status: "resigned",
          });

          // Re-pair the freed players immediately
          await runArenaMatchmakingWave(admin, tournament.id);

          console.log(`[arena] No-show auto-resign: game ${g.id}, ${loser} (${loserId}) didn't move in 2 min, ${winner} (${winnerId}) wins`);
        }

        // Safety-net matchmaking sweep (event-driven calls on game-finish and
        // join already handle the common case instantly; this catches anyone
        // left stranded — e.g. a lone odd-one-out who now has a partner).
        await runArenaMatchmakingWave(admin, tournament.id);
      } catch (e: any) {
        results.errors.push(`Arena ${tournament.name}: ${e.message}`);
      }
    }

    // ── 2. AUTO-ADVANCE: Advance when current round is complete ──
    const { data: activeTournaments } = await admin
      .from("tournaments")
      .select("id, name, current_round, rounds, type, knockout_format, group_schedule, time_control, initial_minutes, increment_seconds, rest_minutes, countdown_minutes")
      .eq("status", "active");

    for (const tournament of activeTournaments || []) {
      try {
        // Arena tournaments are handled in the arena section above
        if (tournament.type === "arena") continue;

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

        // ─── Knockout tournament advancement ───────────────────────────
        if (tournament.type === "knockout") {
          const groupSchedule = tournament.group_schedule;
          const koFormat = tournament.knockout_format || "pure";

          // Get previous round pairings with results
          const { data: prevRound } = await admin
            .from("tournament_rounds")
            .select("pairings")
            .eq("tournament_id", tournament.id)
            .eq("round_number", currentRound)
            .single();

          if (!prevRound?.pairings) continue;
          const prevPairings = prevRound.pairings as Array<Record<string, any>>;

          let koPairings: Array<{ white: string; black: string; bye?: string; group?: number }> = [];
          let thirdPlaceIndex = -1;
          let phase = "knockout";

          if (groupSchedule && Array.isArray(groupSchedule) && koFormat === "group_stage") {
            const numGroupRounds = groupSchedule.length;

            if (nextRound <= numGroupRounds) {
              // ── Still in group stage — use pre-generated schedule ──
              phase = "group_stage";
              const roundData = groupSchedule.find((r: any) => r.round === nextRound);
              if (roundData) {
                for (const p of roundData.pairings) {
                  koPairings.push({ white: p.white || "", black: p.black || "", bye: p.bye, group: p.group });
                }
              }
            } else if (nextRound === numGroupRounds + 1) {
              // ── Transition: group stage → knockout bracket ──
              const { data: allParts } = await admin
                .from("tournament_participants")
                .select("player_id, score, wins, seed")
                .eq("tournament_id", tournament.id);

              // Build group assignments from schedule
              const groupAssignments = new Map<string, number>();
              for (const round of groupSchedule as any[]) {
                for (const p of round.pairings) {
                  if (p.white) groupAssignments.set(p.white, p.group);
                  if (p.black) groupAssignments.set(p.black, p.group);
                  if (p.bye) groupAssignments.set(p.bye, p.group);
                }
              }

              const standings = (allParts || []).map((p: any) => ({
                ...p,
                group: groupAssignments.get(p.player_id) ?? 0,
              }));

              const advancers = getGroupAdvancers(standings as any, 2);

              // Fetch ratings for the advancers
              const { data: advancerProfiles } = await admin
                .from("profiles")
                .select("id, rating")
                .in("id", advancers);

              const advRatingMap = new Map((advancerProfiles || []).map((p: any) => [p.id, p.rating || 1200]));
              const seedPlayers = advancers.map((id, i) => ({
                player_id: id,
                rating: advRatingMap.get(id) || 1200,
                seed: i + 1,
              }));

              const bracket = generateKnockoutBracket(seedPlayers);
              for (const p of bracket) {
                koPairings.push({ white: p.white, black: p.black, bye: p.bye });
              }

              // Update tournament rounds count to include knockout rounds
              const koRounds = knockoutRoundCount(advancers.length);
              await admin.from("tournaments").update({
                rounds: numGroupRounds + koRounds,
              }).eq("id", tournament.id);
            } else {
              // ── Pure knockout rounds after group stage ──
              const { data: postGroupParts } = await admin
                .from("tournament_participants")
                .select("player_id, seed")
                .eq("tournament_id", tournament.id);
              const postGroupSeedLookup = new Map((postGroupParts || []).map((p: any) => [p.player_id, p.seed || 0]));

              const winners: string[] = [];
              const byes: string[] = [];
              const losers: string[] = [];
              for (const p of prevPairings) {
                if (p.bye) { byes.push(p.bye as string); }
                else if (p.white && p.black && p.result) {
                  if (p.result === "white") { winners.push(p.white as string); losers.push(p.black as string); }
                  else if (p.result === "black") { winners.push(p.black as string); losers.push(p.white as string); }
                  else if (p.result === "draw") {
                    const wSeed = postGroupSeedLookup.get(p.white as string) || 0;
                    const bSeed = postGroupSeedLookup.get(p.black as string) || 0;
                    if (wSeed <= bSeed) { winners.push(p.white as string); losers.push(p.black as string); }
                    else { winners.push(p.black as string); losers.push(p.white as string); }
                  }
                }
              }
              const nextPairings = advanceKnockoutRound(winners, byes);
              for (const p of nextPairings) {
                koPairings.push({ white: p.white, black: p.black, bye: p.bye });
              }
              // 3rd-place decider for group-stage knockout
              if (winners.length + byes.length === 2 && losers.length === 2) {
                thirdPlaceIndex = koPairings.length;
                koPairings.push({ white: losers[0], black: losers[1] } as any);
              }
            }
          } else {
            // ── Pure knockout advancement ──
            const winners: string[] = [];
            const byes: string[] = [];
            const losers: string[] = [];

            // Fetch all participants for seed lookup
            const { data: allKoParts } = await admin
              .from("tournament_participants")
              .select("player_id, seed")
              .eq("tournament_id", tournament.id);
            const seedLookup = new Map((allKoParts || []).map((p: any) => [p.player_id, p.seed || 0]));

            for (const p of prevPairings) {
              if (p.bye) { byes.push(p.bye as string); }
              else if (p.white && p.black && p.result) {
                if (p.result === "white") { winners.push(p.white as string); losers.push(p.black as string); }
                else if (p.result === "black") { winners.push(p.black as string); losers.push(p.white as string); }
                else if (p.result === "draw") {
                  const wSeed = seedLookup.get(p.white as string) || 0;
                  const bSeed = seedLookup.get(p.black as string) || 0;
                  if (wSeed <= bSeed) { winners.push(p.white as string); losers.push(p.black as string); }
                  else { winners.push(p.black as string); losers.push(p.white as string); }
                }
              }
            }

            // Check if tournament is complete
            if (isKnockoutComplete(winners.length + byes.length)) {
              await admin.from("tournaments").update({
                status: "finished",
                ended_at: new Date().toISOString(),
              }).eq("id", tournament.id);
              results.finished++;
              continue;
            }

            const nextPairings = advanceKnockoutRound(winners, byes);
            for (const p of nextPairings) {
              koPairings.push({ white: p.white, black: p.black, bye: p.bye });
            }

            // 3rd-place decider: when the semi-finals produce exactly 2 winners
            // (advancing to the final) and exactly 2 losers, pair the losers up
            // for a parallel 3rd-place match in the same round.
            if (winners.length + byes.length === 2 && losers.length === 2) {
              thirdPlaceIndex = koPairings.length;
              koPairings.push({ white: losers[0], black: losers[1] } as any);
            }
          }

          if (koPairings.length === 0) continue;

          // Create the next round
          const restMin = tournament.rest_minutes || 5;
          const koStart = new Date(Date.now() + restMin * 60 * 1000);

          // Fetch ratings for game creation
          const koPlayerIds = koPairings.flatMap((p) => [p.white, p.black].filter(Boolean));
          const { data: koProfiles } = await admin.from("profiles").select("id, rating").in("id", koPlayerIds);
          const koRatingMap = new Map((koProfiles || []).map((p: any) => [p.id, p.rating || 1200]));

          await admin.from("tournament_rounds").insert({
            tournament_id: tournament.id,
            round_number: nextRound,
            pairings: koPairings.map((p, i) => ({
              board: i + 1,
              white: p.white || null,
              black: p.black || null,
              bye: p.bye || null,
              result: null,
              group: p.group ?? null,
              is_third_place: i === thirdPlaceIndex,
            })),
            is_complete: false,
            starts_at: koStart.toISOString(),
          });

          // Create games
          const koMatchPairings = koPairings.filter((p) => !p.bye && p.white && p.black);
          const koByePairings = koPairings.filter((p) => p.bye);
          const koInitialMs = (tournament.initial_minutes || 10) * 60 * 1000;

          const koGameRows = koMatchPairings.map((pairing) => ({
            white_player_id: pairing.white,
            black_player_id: pairing.black,
            white_rating: koRatingMap.get(pairing.white) || 1200,
            black_rating: koRatingMap.get(pairing.black) || 1200,
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
            white_clock_ms: koInitialMs,
            black_clock_ms: koInitialMs,
            scheduled_start: koStart.toISOString(),
          }));

          let koGameIds: Record<string, string> = {};
          if (koGameRows.length > 0) {
            const { data: insertedKoGames } = await admin
              .from("games")
              .insert(koGameRows)
              .select("id, white_player_id, black_player_id");
            for (const g of insertedKoGames || []) {
              koGameIds[`${g.white_player_id}|${g.black_player_id}`] = g.id;
            }
          }

          // Update pairings with game IDs
          const koPairingsWithIds = koPairings.map((p, i) => ({
            board: i + 1,
            white: p.white || null,
            black: p.black || null,
            bye: p.bye || null,
            result: null,
            group: p.group ?? null,
            is_third_place: i === thirdPlaceIndex,
            game_id: koGameIds[`${p.white}|${p.black}`] || null,
          }));
          await admin
            .from("tournament_rounds")
            .update({ pairings: koPairingsWithIds })
            .eq("tournament_id", tournament.id)
            .eq("round_number", nextRound);

          // Handle byes
          for (const p of koByePairings) {
            const { data: byePart } = await admin
              .from("tournament_participants")
              .select("score, wins, games_played")
              .eq("tournament_id", tournament.id)
              .eq("player_id", p.bye!)
              .single();
            if (byePart) {
              await admin.from("tournament_participants")
                .update({
                  score: byePart.score + 1,
                  wins: byePart.wins + 1,
                  games_played: byePart.games_played + 1,
                })
                .eq("player_id", p.bye!)
                .eq("tournament_id", tournament.id);
            }
          }

          await admin.from("tournaments").update({ current_round: nextRound }).eq("id", tournament.id);

          // Notify participants
          const { data: koParticipants } = await admin
            .from("tournament_participants")
            .select("player_id")
            .eq("tournament_id", tournament.id);
          for (const p of koParticipants || []) {
            try {
              await admin.from("notifications").insert({
                user_id: (p as any).player_id,
                type: "tournament_round",
                title: `Round ${nextRound} of ${tournament.name}`,
                body: `Your next game is ready! Round ${nextRound} has been paired.`,
                data: { tournamentName: tournament.name, tournamentId: tournament.id, round: nextRound, phase },
                read: false,
              });
            } catch {}
          }

          results.advanced++;
          continue;
        }

        // ─── Swiss tournament advancement (existing logic) ──────────────
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

    // ── 3. START-SCHEDULED GAMES: Transition "waiting" games to "playing" when their scheduled_start has passed ──
    const { data: waitingGames } = await admin
      .from("games")
      .select("id, tournament_id, white_player_id, black_player_id, tournament_round")
      .eq("status", "waiting")
      .not("scheduled_start", "is", null)
      .lte("scheduled_start", now);

    if (waitingGames && waitingGames.length > 0) {
      const gameIds = waitingGames.map((g) => g.id);
      await admin
        .from("games")
        .update({ status: "playing", last_move_at: now })
        .in("id", gameIds);

      // Send game_started notifications
      const tournamentIds = [...new Set(waitingGames.map((g) => g.tournament_id))];
      const { data: tournaments } = await admin
        .from("tournaments")
        .select("id, name")
        .in("id", tournamentIds);
      const tournamentMap = new Map((tournaments || []).map((t) => [t.id, t.name]));

      const notifications = waitingGames.flatMap((g) => [
        {
          user_id: g.white_player_id,
          type: "game_started",
          title: `Your game has started — ${tournamentMap.get(g.tournament_id) || "Tournament"}`,
          body: `Round ${g.tournament_round} has begun! Your clock is running. Make your move now.`,
          data: { gameId: g.id, tournamentId: g.tournament_id },
          read: false,
        },
        {
          user_id: g.black_player_id,
          type: "game_started",
          title: `Your game has started — ${tournamentMap.get(g.tournament_id) || "Tournament"}`,
          body: `Round ${g.tournament_round} has begun! Your clock is running. Make your move now.`,
          data: { gameId: g.id, tournamentId: g.tournament_id },
          read: false,
        },
      ]);

      if (notifications.length > 0) {
        await admin.from("notifications").insert(notifications).then(() => {}, () => {});
      }

      (results as any).gamesStarted = gameIds.length;
    }

    // ── 4. GAME TIMEOUT SWEEP: Resolve games whose clocks have expired ──
    // This catches games where neither player has the board open (and thus
    // the client-side timeout-check never fires). Without this, tournament
    // games with absent players would stay "playing" forever.
    const { data: activeGames } = await admin
      .from("games")
      .select("id, turn, move_count, white_player_id, black_player_id, white_rating, black_rating, rated, tournament_id, white_clock_ms, black_clock_ms, last_move_at, created_at")
      .eq("status", "playing");

    let timedOut = 0;
    for (const game of activeGames || []) {
      const lastMoveTime = new Date(game.last_move_at || game.created_at).getTime();
      const elapsedMs = Date.now() - lastMoveTime;
      const currentClockMs = game.turn === "white" ? game.white_clock_ms : game.black_clock_ms;
      const remainingMs = (currentClockMs ?? 0) - elapsedMs;

      if (remainingMs <= 0) {
        try {
          const { resolveTimeoutForGame } = await import("@/lib/game/resolve-timeout");
          await resolveTimeoutForGame(admin, game);
          timedOut++;
        } catch (e: any) {
          results.errors.push(`Timeout for game ${game.id}: ${e.message}`);
        }
      }
    }
    (results as any).timedOut = timedOut;

    // ── 5. RE-CHECK AUTO-ADVANCE: If timeouts just completed a round, advance now ──
    if (timedOut > 0) {
      const { data: recheckActive } = await admin
        .from("tournaments")
        .select("id, name, current_round, rounds, type, knockout_format, group_schedule, time_control, initial_minutes, increment_seconds, rest_minutes, countdown_minutes")
        .eq("status", "active");

      for (const tournament of recheckActive || []) {
        try {
          if (tournament.type === "arena") continue;

          const currentRound = tournament.current_round || 1;
          const { data: round } = await admin
            .from("tournament_rounds")
            .select("id, is_complete")
            .eq("tournament_id", tournament.id)
            .eq("round_number", currentRound)
            .single();

          if (!round?.is_complete) continue;

          if (tournament.rounds && currentRound >= tournament.rounds) {
            await admin.from("tournaments").update({ status: "finished", ended_at: new Date().toISOString() }).eq("id", tournament.id);
            results.finished++;
            continue;
          }

          if (!tournament.rounds) continue;

          // Swiss re-advance (simplified — same logic as section 2)
          if (tournament.type !== "knockout") {
            const nextRound = currentRound + 1;
            const restMin = tournament.rest_minutes || 5;
            const rnStart = new Date(Date.now() + restMin * 60 * 1000);

            const { data: participants } = await admin
              .from("tournament_participants")
              .select("player_id, score, seed, wins, losses, draws, games_played")
              .eq("tournament_id", tournament.id)
              .order("score", { ascending: false })
              .order("seed", { ascending: true });

            if (!participants || participants.length < 2) continue;

            const playerIds = participants.map((p: any) => p.player_id);
            const { data: profiles } = await admin.from("profiles").select("id, rating").in("id", playerIds);

            const { data: previousGames } = await admin
              .from("games")
              .select("white_player_id, black_player_id")
              .eq("tournament_id", tournament.id);
            const previousMatchups = new Set<string>();
            for (const g of previousGames || []) {
              previousMatchups.add(`${g.white_player_id}|${g.black_player_id}`);
              previousMatchups.add(`${g.black_player_id}|${g.white_player_id}`);
            }

            // Fetch previous byes to avoid repeat byes
            const { data: prevRounds2 } = await admin
              .from("tournament_rounds")
              .select("pairings")
              .eq("tournament_id", tournament.id);
            const previousByes2 = extractPreviousByes(prevRounds2 || []);

            const pairings = generateSwissPairings(
              participants.map((p: any) => ({ player_id: p.player_id, score: p.score || 0, seed: p.seed || 0 })),
              previousMatchups,
              previousByes2,
            );

            await admin.from("tournament_rounds").insert({
              tournament_id: tournament.id,
              round_number: nextRound,
              pairings: pairings.map((p, i) => ({
                board: i + 1, white: p.white || null, black: p.black || null,
                bye: p.bye || null, result: null,
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

            const pairingsWithGameIds = pairings.map((p, i) => ({
              board: i + 1, white: p.white || null, black: p.black || null,
              bye: p.bye || null, result: null,
              game_id: createdGameIds[`${p.white}|${p.black}`] || null,
            }));
            await admin
              .from("tournament_rounds")
              .update({ pairings: pairingsWithGameIds })
              .eq("tournament_id", tournament.id)
              .eq("round_number", nextRound);

            if (byePairings.length > 0) {
              await Promise.all(
                byePairings.map((p) => {
                  const byeP = participants.find((pp: any) => pp.player_id === p.bye);
                  return admin.from("tournament_participants")
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
          }
        } catch (e: any) {
          results.errors.push(`${tournament.name} re-advance: ${e.message}`);
        }
      }
    }

    return NextResponse.json(results);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
