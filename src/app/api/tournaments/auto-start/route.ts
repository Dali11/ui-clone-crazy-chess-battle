import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { generateKnockoutBracket, knockoutRoundCount, generateGroups, generateGroupRoundRobin } from "@/lib/tournament/knockout";

// Can be triggered by cron (with CRON_SECRET) or by any authenticated user
// Also support GET for cron-job.org
export async function GET(req: NextRequest) {
  return handleAutoStart(req);
}

export async function POST(req: NextRequest) {
  return handleAutoStart(req);
}

async function handleAutoStart(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const isCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!isCron) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const now = new Date().toISOString();

    // Find upcoming tournaments whose start time has passed
    const { data: tournaments } = await admin
      .from("tournaments")
      .select("id, name, starts_at, status, type, knockout_format, group_schedule, initial_minutes, increment_seconds, time_control, min_players, entry_fee, countdown_minutes, rest_minutes")
      .eq("status", "upcoming")
      .lte("starts_at", now);

    if (!tournaments || tournaments.length === 0) {
      return NextResponse.json({ checked: 0, started: 0 });
    }

    let started = 0;
    let cancelled = 0;
    const errors: string[] = [];

    for (const tournament of tournaments) {
      try {
        // Fetch participants
        const { data: participants } = await admin
          .from("tournament_participants")
          .select("player_id, score, paid_entry_fee")
          .eq("tournament_id", tournament.id);

        const minRequired = tournament.min_players || 2;

        // Check if minimum players is met
        if (!participants || participants.length < minRequired) {
          // Not enough players — cancel and refund
          await admin
            .from("tournaments")
            .update({ status: "cancelled", ended_at: now })
            .eq("id", tournament.id);

          // Refund entry fees to all paid participants
          if (tournament.entry_fee && tournament.entry_fee > 0) {
            for (const p of participants || []) {
              if (p.paid_entry_fee) {
                await admin.rpc("credit_wallet", {
                  p_user_id: p.player_id,
                  p_amount: tournament.entry_fee,
                });

                // Record refund for audit trail
                await admin.from("deposits").insert({
                  user_id: p.player_id,
                  amount: tournament.entry_fee,
                  status: "success",
                  method: "tournament_refund",
                  reference: `tournament:${tournament.id}:refund:min_players_not_met`,
                });
              }
            }
          }

          // Notify all participants
          for (const p of participants || []) {
            try {
              // Send cancellation email
              const cancelProfile = await admin.from("profiles").select("email").eq("id", p.player_id).single();
              if (cancelProfile.data?.email) {
                await sendEmail({
                  to: cancelProfile.data.email,
                  subject: `${tournament.name} has been cancelled`,
                  template: "tournament_cancelled",
                  data: {
                    tournamentName: tournament.name,
                    refunded: true,
                    reason: "Insufficient players to start",
                    tournamentId: tournament.id,
                  },
                }).catch(() => {});
              }

              await admin.from("notifications").insert({
                user_id: p.player_id,
                type: "tournament_cancelled",
                title: `${tournament.name} was cancelled`,
                body: `The tournament didn't meet the minimum of ${minRequired} players. ${tournament.entry_fee > 0 ? "Your entry fee has been refunded." : ""}`,
                data: { tournamentName: tournament.name, tournamentId: tournament.id },
                read: false,
              });
            } catch {}
          }

          cancelled++;
          errors.push(`${tournament.name}: cancelled (only ${participants?.length || 0}/${minRequired} players)`);
          continue;
        }

        // Fetch ratings for seeding
        const playerIds = participants.map((p) => p.player_id);
        const { data: profiles } = await admin
          .from("profiles")
          .select("id, rating")
          .in("id", playerIds);

        const ratingMap = new Map((profiles || []).map((p) => [p.id, p.rating || 1200]));

        // Seed by rating
        const seeded = participants
          .map((p) => ({ ...p, rating: ratingMap.get(p.player_id) || 1200 }))
          .sort((a, b) => b.rating - a.rating);

        // Update seeds
        for (let i = 0; i < seeded.length; i++) {
          await admin
            .from("tournament_participants")
            .update({ seed: i + 1 })
            .eq("player_id", seeded[i].player_id)
            .eq("tournament_id", tournament.id);
        }

        // Generate pairings based on tournament type
        let pairings: Array<{ white: string; black: string; bye?: string; group?: number }> = [];

        if (tournament.type === "knockout") {
          const seedPlayers = seeded.map((s: any, i: number) => ({ player_id: s.player_id, rating: s.rating, seed: i + 1 }));
          const koFormat = tournament.knockout_format || "pure";

          if (koFormat === "group_stage") {
            const groupSize = 4;
            const assignments = generateGroups(seedPlayers, groupSize);
            const groupMap = new Map<number, string[]>();
            for (const a of assignments) {
              if (!groupMap.has(a.group)) groupMap.set(a.group, []);
              groupMap.get(a.group)!.push(a.player_id);
            }
            const numGroupRounds = Math.max(...Array.from(groupMap.values()).map(p => generateGroupRoundRobin(p).length));
            const groupSchedule: Array<{ round: number; pairings: Array<any> }> = [];
            for (let r = 0; r < numGroupRounds; r++) {
              const roundPairings: Array<any> = [];
              for (const [groupNum, groupPlayers] of groupMap) {
                const rr = generateGroupRoundRobin(groupPlayers);
                if (rr[r]) { for (const p of rr[r]) { roundPairings.push({ ...p, group: groupNum }); } }
              }
              groupSchedule.push({ round: r + 1, pairings: roundPairings });
            }
            const knockoutRounds = knockoutRoundCount(Array.from(groupMap.values()).reduce((acc, g) => acc + Math.min(g.length, 2), 0));
            await admin.from("tournaments").update({ group_schedule: groupSchedule, rounds: groupSchedule.length + knockoutRounds }).eq("id", tournament.id);
            const round1 = groupSchedule[0]?.pairings || [];
            for (const p of round1) { pairings.push({ white: p.white, black: p.black, bye: p.bye, group: p.group }); }
          } else {
            const bracket = generateKnockoutBracket(seedPlayers);
            for (const p of bracket) { pairings.push({ white: p.white, black: p.black, bye: p.bye }); }
            await admin.from("tournaments").update({ rounds: knockoutRoundCount(seeded.length) }).eq("id", tournament.id);
          }
        } else {
          // Swiss pairings
          // If odd number of players, give the bye to the lowest seed (last in seeded array)
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
          // Set total rounds for Swiss: ceil(log2(N)) ensures enough rounds for a clear winner, min 3
          const swissRounds = Math.max(3, Math.ceil(Math.log2(seeded.length)));
          await admin.from("tournaments").update({ rounds: swissRounds }).eq("id", tournament.id);
        }

        // Create round entry
        const countdownMin = tournament.countdown_minutes || 2;
        const r1Start = new Date(Date.now() + countdownMin * 60 * 1000);
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

        // Create games (bulk insert) and award byes
        const matchPairings = pairings.filter((p) => !p.bye && p.white && p.black);
        const byePairings = pairings.filter((p) => p.bye);
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
          tournament_id: tournament.id,
          tournament_round: 1,
          fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          turn: "white",
          move_count: 0,
          white_clock_ms: initialMs,
          black_clock_ms: initialMs,
          scheduled_start: r1Start.toISOString(),
        }));

        if (gameRows.length > 0) {
          const { data: insertedGames } = await admin.from("games").insert(gameRows).select("id, white_player_id, black_player_id");
          // Update pairings with game IDs
          const gameIdMap = new Map((insertedGames || []).map((g) => [`${g.white_player_id}|${g.black_player_id}`, g.id]));
          const updatedPairings = pairings.map((p, i) => ({
            board: i + 1,
            white: p.white || null,
            black: p.black || null,
            bye: p.bye || null,
            result: null,
            group: (p as any).group ?? null,
            game_id: gameIdMap.get(`${p.white}|${p.black}`) || null,
          }));
          await admin.from("tournament_rounds").update({ pairings: updatedPairings }).eq("tournament_id", tournament.id).eq("round_number", 1);
        }

        for (const pairing of byePairings) {
          await admin
            .from("tournament_participants")
            .update({ wins: 1, score: 1, games_played: 1 })
            .eq("player_id", pairing.bye!)
            .eq("tournament_id", tournament.id);
        }

        // Update tournament status
        await admin
          .from("tournaments")
          .update({ status: "active", current_round: 1 })
          .eq("id", tournament.id);

        // Notify all participants
        for (const p of participants) {
          try {
            await admin.from("notifications").insert({
              user_id: p.player_id,
              type: "tournament_started",
              title: `${tournament.name} has started!`,
              body: `Your tournament "${tournament.name}" is now active. Your first game is waiting.`,
              data: { tournamentName: tournament.name, tournamentId: tournament.id },
              read: false,
            });
          } catch {}
        }

        started++;
      } catch (e: any) {
        errors.push(`${tournament.name}: ${e.message}`);
      }
    }

    return NextResponse.json({ checked: tournaments.length, started, cancelled, errors });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Auto-start failed" }, { status: 500 });
  }
}
