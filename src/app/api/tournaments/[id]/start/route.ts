import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateKnockoutBracket, knockoutRoundCount, generateGroups, generateGroupRoundRobin } from "@/lib/tournament/knockout";

// Allow enough time for large tournaments (100+ players) to seed + create games
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const tournamentId = resolvedParams.id;

    // Fetch tournament first to check ownership
    const admin = createAdminClient();
    const { data: tournament, error: tError } = await admin
      .from("tournaments")
      .select("*")
      .eq("id", tournamentId)
      .single();

    if (tError || !tournament) {
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
      return NextResponse.json(
        { error: "Only the tournament creator or an admin can start the tournament" },
        { status: 403 }
      );
    }

    if (tournament.status !== "upcoming") {
      return NextResponse.json({ error: "Tournament is not upcoming" }, { status: 400 });
    }

    // Check minimum players
    const { count } = await admin
      .from("tournament_participants")
      .select("id", { count: "exact", head: true })
      .eq("tournament_id", tournamentId);

    const minRequired = tournament.min_players || 2;
    if (count !== null && count < minRequired) {
      return NextResponse.json(
        { error: `Minimum ${minRequired} players required. Currently ${count} registered.` },
        { status: 400 }
      );
    }

    // Fetch all participants
    const { data: participants, error: pError } = await admin
      .from("tournament_participants")
      .select("player_id, score")
      .eq("tournament_id", tournamentId);

    if (pError) {
      return NextResponse.json({ error: pError.message }, { status: 500 });
    }

    if (!participants || participants.length === 0) {
      return NextResponse.json({ error: "No participants to start" }, { status: 400 });
    }

    // Fetch ratings for seeding
    const playerIds = participants.map((p) => p.player_id);
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, rating")
      .in("id", playerIds);

    const ratingMap = new Map((profiles || []).map((p) => [p.id, p.rating || 1200]));

    // Seed participants by rating (highest first)
    const seeded = participants
      .map((p) => ({
        ...p,
        rating: ratingMap.get(p.player_id) || 1200,
      }))
      .sort((a, b) => b.rating - a.rating);

    // Update seeds — run in parallel (was sequential, ~O(n) round-trips in series)
    await Promise.all(
      seeded.map((s, i) =>
        admin
          .from("tournament_participants")
          .update({ seed: i + 1 })
          .eq("player_id", s.player_id)
          .eq("tournament_id", tournamentId)
      )
    );

    // Generate pairings based on tournament type
    const pairings: Array<{ white: string; black: string; bye?: string }> = [];

    if (tournament.type === "knockout") {
      // ─── Knockout: single-elimination bracket ───
      const knockoutFormat = tournament.knockout_format || "pure";

      if (knockoutFormat === "group_stage") {
        // Group stage → knockout: start with round-robin groups
        const groupSize = 4;
        const groups = generateGroups(
          seeded.map((s) => ({ player_id: s.player_id, rating: s.rating, seed: s.rating ? 0 : 0 })),
          groupSize
        );

        // Actually use seed numbers (not 0)
        const seedPlayers = seeded.map((s, i) => ({ player_id: s.player_id, rating: s.rating, seed: i + 1 }));
        const assignments = generateGroups(seedPlayers, groupSize);

        // Group players by group number
        const groupMap = new Map<number, string[]>();
        for (const a of assignments) {
          if (!groupMap.has(a.group)) groupMap.set(a.group, []);
          groupMap.get(a.group)!.push(a.player_id);
        }

        // Generate round-robin pairings for each group
        // All groups play their round 1 simultaneously
        for (const [groupNum, groupPlayers] of groupMap) {
          const groupRounds = generateGroupRoundRobin(groupPlayers);
          // Only take round 1 for now — subsequent group rounds will be generated
          // Actually, we need to generate ALL group rounds at once for the group stage
          // But our tournament structure uses tournament_rounds per round_number...
          // For now, generate all group round pairings and store them as a group_stage_schedule
          // Then each "round" in the tournament corresponds to one round of ALL groups simultaneously
          for (let r = 0; r < groupRounds.length; r++) {
            // We'll handle this via the scheduled pairings approach below
          }
        }

        // Simpler approach: generate round 1 pairings across all groups
        const numGroupRounds = Math.max(...Array.from(groupMap.values()).map(p => generateGroupRoundRobin(p).length));
        // Store the full group schedule in tournament metadata
        const groupSchedule: Array<{ round: number; pairings: Array<{ white: string; black: string; bye?: string; group: number }> }> = [];

        for (let r = 0; r < numGroupRounds; r++) {
          const roundPairings: Array<{ white: string; black: string; bye?: string; group: number }> = [];
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

        // Save group schedule to tournament metadata for later rounds
        await admin.from("tournaments").update({
          group_schedule: groupSchedule,
          total_rounds: groupSchedule.length + knockoutRoundCount(
            Array.from(groupMap.values()).reduce((acc, g) => acc + Math.min(g.length, 2), 0)
          ),
        }).eq("id", tournamentId);

        // Use group schedule round 1 pairings
        const round1Pairings = groupSchedule[0]?.pairings || [];
        for (const p of round1Pairings) {
          pairings.push({ white: p.white, black: p.black, bye: p.bye });
        }

        // Set tournament rounds to total group rounds + knockout rounds
        const totalRounds = groupSchedule.length + knockoutRoundCount(
          Array.from(groupMap.values()).reduce((acc, g) => acc + Math.min(g.length, 2), 0)
        );
        await admin.from("tournaments").update({ rounds: totalRounds }).eq("id", tournamentId);

      } else {
        // Pure knockout
        const seedPlayers = seeded.map((s, i) => ({ player_id: s.player_id, rating: s.rating, seed: i + 1 }));
        const knockoutPairings = generateKnockoutBracket(seedPlayers);
        pairings.push(...knockoutPairings);

        // Auto-calculate rounds
        const numRounds = knockoutRoundCount(seeded.length);
        await admin.from("tournaments").update({ rounds: numRounds }).eq("id", tournamentId);
      }

    } else {
      // ─── Swiss pairing (existing logic) ───
      if (seeded.length === 1) {
        pairings.push({ white: "", black: "", bye: seeded[0].player_id });
      } else {
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
      }
    }

    // Calculate when Round 1 games should start (now + countdown minutes)
    const countdownMinutes = tournament.countdown_minutes || 2;
    const scheduledStart = new Date(Date.now() + countdownMinutes * 60 * 1000);

    // Create tournament round entry with scheduled start time
    const groupSchedulePairings = (tournament.type === "knockout" && (tournament.knockout_format === "group_stage"))
      ? (pairings as any).map((p: any, i: number) => ({
          board: i + 1,
          white: p.white || null,
          black: p.black || null,
          bye: p.bye || null,
          result: null,
          group: p.group ?? null,
        }))
      : pairings.map((p, i) => ({
          board: i + 1,
          white: p.white || null,
          black: p.black || null,
          bye: p.bye || null,
          result: null,
        }));

    const { error: roundError } = await admin
      .from("tournament_rounds")
      .insert({
        tournament_id: tournamentId,
        round_number: 1,
        pairings: groupSchedulePairings,
        is_complete: false,
        starts_at: scheduledStart.toISOString(),
      });

    if (roundError) {
      console.error("Round creation error:", roundError);
    }

    // Split byes from real matches so we can bulk-insert games in ONE call
    // instead of N sequential inserts — this is what was at risk of timing
    // out (and partially failing) once tournaments hit ~50-100 players.
    const byePairings = pairings.filter((p) => p.bye);
    const matchPairings = pairings.filter((p) => !p.bye);

    const initialMs = (tournament.initial_minutes || 10) * 60 * 1000;

    const gameRows = matchPairings.map((pairing) => ({
      white_player_id: pairing.white,
      black_player_id: pairing.black,
      white_rating: ratingMap.get(pairing.white) || 1200,
      black_rating: ratingMap.get(pairing.black) || 1200,
      status: "waiting",
      time_control: tournament.time_control,
      initial_minutes: tournament.initial_minutes,
      increment_seconds: tournament.increment_seconds,
      rated: false,
      tournament_id: tournamentId,
      tournament_round: 1,
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
          admin
            .from("tournament_participants")
            .update({ wins: 1, score: 1, games_played: 1 })
            .eq("player_id", p.bye)
            .eq("tournament_id", tournamentId)
        )
      );
    }

    const writeResults = await Promise.all(writes);
    const writeError = writeResults.find((r: any) => r?.error)?.error;
    if (writeError) {
      console.error("Game/bye creation error:", writeError);
    }

    // Update tournament status
    const { error: updateError } = await admin
      .from("tournaments")
      .update({ status: "active", current_round: 1 })
      .eq("id", tournamentId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Send notifications to all participants
    const notifData = { tournamentName: tournament.name, tournamentId, startTime: scheduledStart.toISOString() };
    await Promise.all(
      participants.map((p) =>
        admin.from("notifications").insert({
          user_id: p.player_id,
          type: "round_starting",
          title: `Round 1 starts in ${countdownMinutes} minutes — ${tournament.name}`,
          body: `Get ready! Your game starts at ${new Date(scheduledStart.getTime() + 2 * 60 * 60 * 1000).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} CAT. Go to the tournament page and enter your game.`,
          data: notifData,
          read: false,
        }).then(() => {}, () => {})
      )
    );

    return NextResponse.json({
      success: true,
      pairings: pairings.length,
      round: 1,
      scheduledStart: scheduledStart.toISOString(),
      countdownMinutes,
    });
  } catch (e: any) {
    console.error("Start tournament error:", e);
    return NextResponse.json(
      { error: e.message || "Failed to start tournament" },
      { status: 500 }
    );
  }
}
