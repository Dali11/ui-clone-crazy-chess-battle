import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyBattleJoinWindow } from "@/lib/battles/join-window";
import { settleBattle } from "@/lib/battles/settle";

/**
 * Server-side auto-heal for battles stuck in "pending".
 * Runs every 2 minutes via Vercel Cron. Also callable manually (POST).
 *
 * Case 1: pending + game_id NULL
 *   - age 60s-5min: retry game creation
 *   - age > 5min: cancel battle, refund both stakes
 * Case 2: pending + game_id NOT NULL (legacy bug: status never advanced)
 *   - if game finished: settle now
 *   - if still playing: correct status to "playing"
 * Case 3: battle_queue rows stuck in "waiting" past the queue timeout
 *   - The active/join routes refund these when the PLAYER returns, but if
 *     they closed the app mid-search the stake sat in escrow forever.
 *   - Refund them here, with a 60s grace so the player's own visit path
 *     (nicer toast message) wins the race. Same atomic claim either way.
 */

function verifyCronAuth(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  // No x-vercel-cron bypass: that header is client-settable and would
  // let anyone skip the secret.
  return req.headers.get("authorization") === `Bearer ${cronSecret}`;
}

const TIME_CONTROLS: Record<string, { minutes: number; increment: number }> = {
  bullet: { minutes: 1, increment: 0 }, blitz3: { minutes: 3, increment: 2 },
  blitz: { minutes: 5, increment: 0 }, rapid: { minutes: 10, increment: 0 },
  rapid15: { minutes: 15, increment: 10 }, classical: { minutes: 30, increment: 0 },
};

export async function GET(req: NextRequest) { return handleHeal(req); }
export async function POST(req: NextRequest) { return handleHeal(req); }

async function handleHeal(req: NextRequest) {
  if (!verifyCronAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const now = Date.now();
  const results = { scanned: 0, gameCreated: 0, statusCorrected: 0, settled: 0, cancelledAndRefunded: 0, stillRetrying: 0, queuesExpired: 0, failed: 0 };

  try {
    const cutoff = new Date(now - 60_000).toISOString();
    const { data: stuckBattles, error } = await admin.from("battles")
      .select("id, status, game_id, white_player_id, black_player_id, stake, created_at, time_control")
      .eq("status", "pending").lt("created_at", cutoff).order("created_at", { ascending: true }).limit(100);

    if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });
    results.scanned = stuckBattles?.length ?? 0;
    let config: any = null;

    for (const battle of stuckBattles ?? []) {
      const ageMs = now - new Date(battle.created_at).getTime();

      // Case 2: game_id linked but status never advanced
      if (battle.game_id) {
        const { data: game } = await admin.from("games").select("status, winner").eq("id", battle.game_id).single();
        if (!game) {
          // Game vanished — fall through to case 1
        } else if (game.status !== "playing" && game.status !== "waiting") {
          try {
            let winnerId: string | null = null;
            if (game.winner === "white") winnerId = battle.white_player_id;
            else if (game.winner === "black") winnerId = battle.black_player_id;
            await settleBattle(battle.id, winnerId, game.status || "unknown");
            results.settled++;
          } catch { results.failed++; }
          continue;
        } else {
          const { error: fixErr } = await admin.from("battles").update({ status: "playing" }).eq("id", battle.id).eq("status", "pending");
          if (!fixErr) results.statusCorrected++;
          continue;
        }
      }

      // Case 1: no game_id
      if (ageMs < 5 * 60_000) {
        if (!config) { const { data: configRow } = await admin.from("battle_config").select("*").limit(1).single(); config = configRow ?? {}; }
        const tcConfig = battle.time_control && TIME_CONTROLS[battle.time_control];
        const minutes = tcConfig?.minutes ?? config.initial_minutes ?? 5;
        const increment = tcConfig?.increment ?? config.increment_seconds ?? 2;
        const { data: battleRow } = await admin.from("battles").select("white_rating, black_rating").eq("id", battle.id).single();
        const { data: gameId, error: gameErr } = await admin.rpc("create_game", {
          p_white_id: battle.white_player_id, p_black_id: battle.black_player_id,
          p_white_rating: battleRow?.white_rating ?? 1200, p_black_rating: battleRow?.black_rating ?? 1200,
          p_time_control: "battle", p_initial_minutes: minutes, p_increment_seconds: increment, p_rated: true,
        });
        if (gameErr || !gameId) { results.stillRetrying++; continue; }
        const { error: linkErr } = await admin.from("battles")
          .update({ game_id: gameId, status: "playing", started_at: new Date().toISOString() }).eq("id", battle.id).eq("status", "pending");
        if (linkErr) results.failed++; else { results.gameCreated++; await applyBattleJoinWindow(admin, gameId); }
        continue;
      }

      // Past retry window — cancel and refund
      const { data: claimed } = await admin.from("battles")
        .update({ status: "cancelled", notes: "Auto-cancelled by heal-stuck: game creation never succeeded after 5 minutes." })
        .eq("id", battle.id).eq("status", "pending").is("game_id", null).select("id").single();
      if (!claimed) continue;

      const [{ error: c1 }, { error: c2 }] = await Promise.all([
        admin.rpc("credit_wallet", { p_user_id: battle.white_player_id, p_amount: battle.stake }),
        admin.rpc("credit_wallet", { p_user_id: battle.black_player_id, p_amount: battle.stake }),
      ]);
      if (c1 || c2) { results.failed++; continue; }

      await admin.from("deposits").insert([
        { user_id: battle.white_player_id, amount: battle.stake, status: "success", method: "battle_refund", reference: `heal_stuck:${battle.id}:white` },
        { user_id: battle.black_player_id, amount: battle.stake, status: "success", method: "battle_refund", reference: `heal_stuck:${battle.id}:black` },
      ]);
      await admin.from("battle_escrow").update({ status: "refunded", released_at: new Date().toISOString() }).eq("battle_id", battle.id);
      results.cancelledAndRefunded++;
    }

    // ── Case 3: stale queue rows — refund escrow even if the player
    // never reopens /battles. 60s grace past queue_timeout_s so the
    // player-visible timeout path (same atomic claim) fires first.
    const { data: queueConfig } = await admin.from("battle_config").select("queue_timeout_s").limit(1).maybeSingle();
    const queueCutoff = new Date(now - ((queueConfig?.queue_timeout_s ?? 120) * 1000 + 60_000)).toISOString();
    const { data: staleQueues, error: queueSelErr } = await admin.from("battle_queue")
      .select("id, player_id, stake, created_at")
      .eq("status", "waiting").lt("created_at", queueCutoff)
      .order("created_at", { ascending: true }).limit(200);
    if (queueSelErr) {
      console.error("[heal-stuck] stale queue select failed:", queueSelErr);
    }

    for (const q of staleQueues ?? []) {
      // Atomic claim — matches /api/battles/active and /api/battles/join,
      // so concurrent paths can never double-refund.
      const { data: claimed, error: claimErr } = await admin.from("battle_queue")
        .update({ status: "expired" }).eq("id", q.id).eq("status", "waiting")
        .select("id, stake").maybeSingle();
      if (claimErr) {
        // Real failure (e.g. constraint/index error) — must surface, never swallow
        console.error("[heal-stuck] queue claim failed:", q.id, claimErr);
        results.failed++;
        continue;
      }
      if (!claimed) continue; // another path handled it

      const { error: creditErr } = await admin.rpc("credit_wallet", { p_user_id: q.player_id, p_amount: claimed.stake });
      if (creditErr) {
        // Refund failed — revert so the player's own visit (or next run) retries
        await admin.from("battle_queue").update({ status: "waiting" }).eq("id", q.id);
        results.failed++;
        continue;
      }
      await admin.from("deposits").insert({
        user_id: q.player_id, amount: claimed.stake, status: "success",
        method: "battle_refund", reference: `battle_queue_timeout:${claimed.id}`,
      }).then(() => {}, () => {});
      results.queuesExpired++;
    }

    console.log("[heal-stuck]", JSON.stringify(results));
    return NextResponse.json({ success: true, ...results });
  } catch (e: any) {
    console.error("[heal-stuck] error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
