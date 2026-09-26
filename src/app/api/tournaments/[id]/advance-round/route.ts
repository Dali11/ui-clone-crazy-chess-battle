import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceKnockoutRound, knockoutRoundCount, generateKnockoutBracket, getGroupAdvancers, generateGroups, generateGroupRoundRobin } from "@/lib/tournament/knockout";
import { getRestMinutes } from "@/lib/tournament/rest";
import { sendEmail, sendBatchEmails } from "@/lib/email";
import { finishTournament } from "@/lib/tournament/finish";
import { generateSwissPairings, extractPreviousByes } from "@/lib/tournament/swiss-pairing";

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
      // All rounds done — finish tournament + distribute prizes
      await finishTournament(tournamentId);
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

    // Fetch participants (needed for both knockout and Swiss)
    const { data: participants } = await admin
      .from("tournament_participants")
      .select("player_id, score, seed, wins, losses, draws, games_played")
      .eq("tournament_id", tournamentId)
      .order("score", { ascending: false })
      .order("seed", { ascending: true });

    if (!participants || participants.length === 0) {
      return NextResponse.json({ error: "No participants" }, { status: 400 });
    }

    // ─── Knockout advancement ──────────────────────────────────────────
    if (tournament.type === "knockout") {
      // Get previous round pairings with results to determine winners
      const { data: prevRound } = await admin
        .from("tournament_rounds")
        .select("pairings")
        .eq("tournament_id", tournamentId)
        .eq("round_number", tournament.current_round)
        .single();

      if (!prevRound?.pairings) {
        return NextResponse.json({ error: "Previous round not found" }, { status: 400 });
      }

      const prevPairings = prevRound.pairings as Array<Record<string, unknown>>;

      // Determine winners from completed games
      const winners: string[] = [];
      const byes: string[] = [];
      const losers: string[] = [];

      for (const p of prevPairings) {
        if (p.bye) {
          byes.push(p.bye as string);
        } else if (p.white && p.black && p.result) {
          if (p.result === "white") {
            winners.push(p.white as string);
            losers.push(p.black as string);
          } else if (p.result === "black") {
            winners.push(p.black as string);
            losers.push(p.white as string);
          } else if (p.result === "draw") {
            // Fallback: Armageddon tiebreak should have resolved this to a decisive
            // result. If we still see "draw" here, the tiebreak failed to create or
            // resolve — fall back to higher seed advancing.
            console.warn("[advance-round] Knockout pairing still has result=draw (Armageddon tiebreak may have failed). Falling back to seed-based advancement.");
            const whiteSeed = participants.find((p2: any) => p2.player_id === p.white)?.seed || 0;
            const blackSeed = participants.find((p2: any) => p2.player_id === p.black)?.seed || 0;
            if (whiteSeed <= blackSeed) {
              winners.push(p.white as string);
              losers.push(p.black as string);
            } else {
              winners.push(p.black as string);
              losers.push(p.white as string);
            }
          }
        }
      }

      // Check if we're transitioning from group stage to knockout
      const groupSchedule = tournament.group_schedule;
      if (groupSchedule && Array.isArray(groupSchedule)) {
        const numGroupRounds = groupSchedule.length;

        if (nextRound <= numGroupRounds) {
          // Still in group stage — use the pre-generated schedule
          const roundData = groupSchedule.find((r: any) => r.round === nextRound);
          if (roundData) {
            const pairings: Array<{ white: string; black: string; bye?: string }> = [];
            for (const p of roundData.pairings) {
              pairings.push({ white: p.white, black: p.black, bye: p.bye });
            }
            // Create round and games (same as below — we'll refactor to shared function)
            // For now, fall through to the generic round creation below
            // But we need to use these pairings instead of Swiss
            const restMinutes = getRestMinutes(tournament);
            const scheduledStart = new Date(Date.now() + restMinutes * 60 * 1000);

            await admin.from("tournament_rounds").insert({
              tournament_id: tournamentId,
              round_number: nextRound,
              pairings: pairings.map((p: any, i: number) => ({
                board: i + 1,
                white: p.white || null,
                black: p.black || null,
                bye: p.bye || null,
                result: null,
                group: p.group ?? null,
              })),
              is_complete: false,
              starts_at: scheduledStart.toISOString(),
            });

            const matchPairings = pairings.filter((p) => !p.bye);
            const initialMs = tournament.initial_minutes * 60 * 1000;
            const gameRows = matchPairings.map((pairing) => ({
              white_player_id: pairing.white,
              black_player_id: pairing.black,
              white_rating: 1200,
              black_rating: 1200,
              status: "waiting",
              time_control: tournament.time_control,
              initial_minutes: tournament.initial_minutes,
              increment_seconds: tournament.increment_seconds || 5,
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

            if (gameRows.length > 0) {
              await admin.from("games").insert(gameRows);
            }

            // Byes in group stage — credit the player (atomic, migration 071 RPC)
            const byePairings = pairings.filter((p) => p.bye);
            for (const p of byePairings) {
              await admin.rpc("credit_tournament_bye", { p_tournament_id: tournamentId, p_player_id: p.bye! });
            }

            await admin.from("tournaments").update({ current_round: nextRound }).eq("id", tournamentId);
            return NextResponse.json({ success: true, round: nextRound, pairings: pairings.length, phase: "group_stage", scheduledStart: scheduledStart.toISOString() });
          }
        } else {
          // Transitioning from group stage to knockout
          if (nextRound === numGroupRounds + 1) {
            // Get group standings from participants
            const { data: allParticipants } = await admin
              .from("tournament_participants")
              .select("player_id, score, wins, seed")
              .eq("tournament_id", tournamentId);

            // Get group assignments from schedule
            const groupAssignments = new Map<string, number>();
            for (const round of groupSchedule as any[]) {
              for (const p of round.pairings) {
                if (p.white) groupAssignments.set(p.white, p.group);
                if (p.black) groupAssignments.set(p.black, p.group);
                if (p.bye) groupAssignments.set(p.bye, p.group);
              }
            }

            const standings = (allParticipants || []).map((p) => ({
              ...p,
              group: groupAssignments.get(p.player_id) ?? 0,
            }));

            const advancers = getGroupAdvancers(standings as any, 2);
            const seedPlayers = advancers.map((id, i) => {
              const p = allParticipants?.find((pp) => pp.player_id === id);
              return { player_id: id, rating: 1200, seed: i + 1 };
            });

            const pairings = generateKnockoutBracket(seedPlayers);
            const restMinutes = getRestMinutes(tournament);
            const scheduledStart = new Date(Date.now() + restMinutes * 60 * 1000);

            // Fetch actual ratings for game creation
            const koPlayerIds = pairings.flatMap((p) => [p.white, p.black].filter(Boolean));
            const { data: koProfiles } = await admin.from("profiles").select("id, rating").in("id", koPlayerIds);
            const koRatingMap = new Map((koProfiles || []).map((p: any) => [p.id, p.rating || 1200]));

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

            const matchPairings = pairings.filter((p) => !p.bye);
            const initialMs = tournament.initial_minutes * 60 * 1000;
            const gameRows = matchPairings.map((pairing) => ({
              white_player_id: pairing.white,
              black_player_id: pairing.black,
              white_rating: koRatingMap.get(pairing.white) || 1200,
              black_rating: koRatingMap.get(pairing.black) || 1200,
              status: "waiting",
              time_control: tournament.time_control,
              initial_minutes: tournament.initial_minutes,
              increment_seconds: tournament.increment_seconds || 5,
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

            if (gameRows.length > 0) {
              await admin.from("games").insert(gameRows);
            }

            // Handle byes (atomic, migration 071 RPC)
            const byePairings = pairings.filter((p) => p.bye);
            for (const p of byePairings) {
              await admin.rpc("credit_tournament_bye", { p_tournament_id: tournamentId, p_player_id: p.bye! });
            }

            await admin.from("tournaments").update({ current_round: nextRound }).eq("id", tournamentId);
            return NextResponse.json({ success: true, round: nextRound, pairings: pairings.length, phase: "knockout", scheduledStart: scheduledStart.toISOString() });
          }
        }
      }

      // Pure knockout advancement (or post-group-stage rounds)
      const pairings = advanceKnockoutRound(winners, byes);

      // Check if tournament is complete (1 player remaining)
      if (winners.length + byes.length <= 1) {
        await finishTournament(tournamentId);
        return NextResponse.json({ success: true, finished: true });
      }

      // 3rd-place decider: when semi-finals produce exactly 2 winners
      // and 2 losers, add a 3rd-place match alongside the final.
      const thirdPlacePairing: Array<{ white: string; black: string; bye?: string; is_third_place?: boolean }> =
        (winners.length + byes.length === 2 && losers.length === 2)
        ? [{ white: losers[0], black: losers[1], bye: undefined, is_third_place: true }]
        : [];

      const restMinutes = getRestMinutes(tournament);
      const scheduledStart = new Date(Date.now() + restMinutes * 60 * 1000);

      const allPairings = [...pairings, ...thirdPlacePairing];
      await admin.from("tournament_rounds").insert({
        tournament_id: tournamentId,
        round_number: nextRound,
        pairings: allPairings.map((p, i) => ({
          board: i + 1,
          white: p.white || null,
          black: p.black || null,
          bye: p.bye || null,
          result: null,
          is_third_place: (p as any).is_third_place ?? false,
        })),
        is_complete: false,
        starts_at: scheduledStart.toISOString(),
      });

      const matchPairings = allPairings.filter((p) => !p.bye);
      const initialMs = tournament.initial_minutes * 60 * 1000;

      // Fetch actual ratings
      const pureKoPlayerIds = matchPairings.flatMap((p) => [p.white, p.black].filter(Boolean));
      const { data: pureKoProfiles } = await admin.from("profiles").select("id, rating").in("id", pureKoPlayerIds);
      const pureKoRatingMap = new Map((pureKoProfiles || []).map((p: any) => [p.id, p.rating || 1200]));

      const gameRows = matchPairings.map((pairing) => ({
        white_player_id: pairing.white,
        black_player_id: pairing.black,
        white_rating: pureKoRatingMap.get(pairing.white) || 1200,
        black_rating: pureKoRatingMap.get(pairing.black) || 1200,
        status: "waiting",
        time_control: tournament.time_control,
        initial_minutes: tournament.initial_minutes,
        increment_seconds: tournament.increment_seconds || 5,
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

      let pureKoGameIds: Record<string, string> = {};
      if (gameRows.length > 0) {
        const { data: insertedGames } = await admin.from("games")
          .insert(gameRows)
          .select("id, white_player_id, black_player_id");
        for (const g of insertedGames || []) {
          pureKoGameIds[`${g.white_player_id}|${g.black_player_id}`] = g.id;
        }
      }

      // Update round pairings with game_id
      if (Object.keys(pureKoGameIds).length > 0) {
        await admin.from("tournament_rounds")
          .update({
            pairings: allPairings.map((p, i) => ({
              board: i + 1,
              white: p.white || null,
              black: p.black || null,
              bye: p.bye || null,
              result: null,
              is_third_place: (p as any).is_third_place ?? false,
              game_id: pureKoGameIds[`${p.white}|${p.black}`] || null,
            })),
          })
          .eq("tournament_id", tournamentId)
          .eq("round_number", nextRound);
      }

      // Handle byes (auto-advance) — atomic, migration 071 RPC
      const byePairings = pairings.filter((p) => p.bye);
      for (const p of byePairings) {
        await admin.rpc("credit_tournament_bye", { p_tournament_id: tournamentId, p_player_id: p.bye! });
      }

      await admin.from("tournaments").update({ current_round: nextRound }).eq("id", tournamentId);

      return NextResponse.json({ success: true, round: nextRound, pairings: pairings.length, phase: "knockout", scheduledStart: scheduledStart.toISOString() });
    }

    // ─── Swiss pairing (existing logic) ────────────────────────────────
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

    // Fetch previous byes to avoid giving the same player multiple byes
    const { data: previousRounds } = await admin
      .from("tournament_rounds")
      .select("pairings")
      .eq("tournament_id", tournamentId);
    const previousByes = extractPreviousByes(previousRounds || []);

    // Generate pairings using shared Swiss pairing utility
    // (handles bye tracking, avoids multiple byes, allows rematches as last resort)
    const pairings = generateSwissPairings(
      participants.map((p: any) => ({ player_id: p.player_id, score: p.score || 0, seed: p.seed || 0 })),
      previousMatchups,
      previousByes,
    );

    // Calculate when next round games should start (now + rest minutes)
    const restMinutes = getRestMinutes(tournament);
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
      increment_seconds: tournament.increment_seconds || 5,
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
        ...byePairings.map((p) =>
          admin.rpc("credit_tournament_bye", { p_tournament_id: tournamentId, p_player_id: p.bye })
        )
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

    // Send email notifications (fire-and-forget)
    const { data: roundEmails } = await admin
      .from("profiles")
      .select("email, display_name")
      .in("id", participants.map((p) => p.player_id));
    const roundEmailList = (roundEmails || [])
      .filter((p: any) => p.email)
      .map((p: any) => ({
        to: p.email,
        subject: `Round ${nextRound} starting — ${tournament.name}`,
        template: "tournament_round_live" as const,
        data: {
          tournamentName: tournament.name,
          tournamentId,
          round: nextRound,
          startsIn: `${restMinutes} minutes`,
        },
      }));
    if (roundEmailList.length > 0) {
      sendBatchEmails(roundEmailList).catch(() => {});
    }

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
