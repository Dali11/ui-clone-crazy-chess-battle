import { settleFixedPoolEntryFees, settlePlayerTournamentCancellation } from "@/lib/tournament/creator-economics";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateKnockoutBracket, knockoutRoundCount, generateGroups, generateGroupRoundRobin } from "@/lib/tournament/knockout";

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

    const { data: tournaments } = await admin
      .from("tournaments")
      .select("id, name, starts_at, status, type, knockout_format, group_schedule, initial_minutes, increment_seconds, time_control, min_players, entry_fee, countdown_minutes, rest_minutes, rounds")
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
        const { data: participants } = await admin
          .from("tournament_participants")
          .select("player_id, score, paid_entry_fee")
          .eq("tournament_id", tournament.id);

        const minRequired = tournament.min_players || 2;

        if (!participants || participants.length < minRequired) {
          // Not enough players — cancel and refund
          // ATOMIC GUARD: only cancel if still upcoming
          const { data: claimed } = await admin
            .from("tournaments")
            .update({ status: "cancelled", ended_at: now })
            .eq("id", tournament.id)
            .eq("status", "upcoming")
            .select("id, entry_fee");

          if (!claimed || claimed.length === 0) {
            // Already claimed by another process
            continue;
          }

          // Player-created fixed pools: return escrow / claw back entry share
          await settlePlayerTournamentCancellation(admin, tournament.id);

          // Refund entry fees
          if (tournament.entry_fee && tournament.entry_fee > 0) {
            for (const p of participants || []) {
              if (p.paid_entry_fee) {
                await admin.rpc("credit_wallet", {
                  p_user_id: p.player_id,
                  p_amount: tournament.entry_fee,
                });

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

          // Insert in-app cancellation notifications
          for (const p of participants || []) {
            try {
              await admin.from("notifications").insert({
                user_id: p.player_id,
                type: "tournament_cancelled",
                title: "Tournament cancelled",
                body: `${tournament.name} was cancelled due to insufficient players. Entry fees refunded.`,
                data: { tournament_id: tournament.id },
                read: false,
              });
            } catch {}
          }

          cancelled++;
          continue;
        }

        // Start the tournament
        await admin
          .from("tournaments")
          .update({ status: "active", started_at: now })
          .eq("id", tournament.id);

        // Player-created fixed pools: split collected entry fees 95/5 at start
        await settleFixedPoolEntryFees(admin, tournament.id);

        started++;
      } catch (err: any) {
        errors.push(`${tournament.id}: ${err.message}`);
      }
    }

    return NextResponse.json({ checked: tournaments.length, started, cancelled, errors });
  } catch (error: any) {
    console.error("Auto-start error:", error);
    return NextResponse.json({ error: "Failed to auto-start tournaments" }, { status: 500 });
  }
}
