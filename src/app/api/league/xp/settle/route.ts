import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLeagueXpConfig, currentWeekStart, nextWeekStart, rewardsArray } from "@/lib/league-xp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Weekly XP League settlement — Vercel cron, Mondays 00:05 CAT
 * (Sunday 22:05 UTC, see vercel.json). Requires Bearer CRON_SECRET.
 *
 * For each tier, ranked by XP desc:
 *   - top `promote_count` (default 5): credited their rank reward to the
 *     wallet (credit_wallet RPC, same path as battle payouts) and
 *     promoted one tier (except Queen — top tier stays).
 *   - bottom `demote_count` (default 5): demoted one tier (except Pawn).
 *   - every member's XP resets for the new week and a history snapshot is
 *     written (league_xp_history).
 * Idempotent guard: members already on the new week are skipped, so a
 * re-run or overlap with live traffic can never double-pay.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSettlement();
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runSettlement();
}

async function runSettlement() {
  const admin = createAdminClient();
  const cfg = await getLeagueXpConfig(admin);

  const closingWeek = currentWeekStart(new Date(Date.now() - 60 * 60 * 1000)); // week that just ended
  const newWeek = nextWeekStart(new Date(Date.now() - 60 * 60 * 1000)); // week that starts now
  const rewards = cfg.rewards_enabled ? rewardsArray(cfg) : [0, 0, 0, 0, 0];

  const { data: members, error } = await admin
    .from("league_xp_members")
    .select("user_id, tier, xp, week_start, profiles!inner(display_name, username)")
    .order("xp", { ascending: false })
    .order("updated_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const promoted = cfg.promote_count;
  const demoted = cfg.demote_count;
  let paid = 0, moves = 0, snapshots = 0;

  // Rank within each tier: active members first (by xp desc — the select is
  // already ordered), then anyone whose row predates the closing cycle
  // (no games this week → 0 XP by definition, still reset and eligible
  // for demotion).
  for (const tier of [1, 2, 3, 4, 5]) {
    const tierMembers = (members ?? []).filter((m) => m.tier === tier);
    const active = tierMembers.filter((m) => m.week_start === closingWeek);
    const ranked = [
      ...active,
      ...tierMembers.filter((m) => m.week_start !== closingWeek),
    ];
    const n = ranked.length;

    for (let i = 0; i < n; i++) {
      const m = ranked[i];
      const rank = i + 1;
      const isTop = rank <= promoted && m.week_start === closingWeek && m.xp > 0;
      const isBottom = m.week_start === closingWeek && n > promoted + demoted && rank > n - demoted;

      let reward = 0;
      let newTier = m.tier;
      let didPromote = false, didDemote = false;

      if (isTop) {
        reward = rewards[rank - 1] ?? 0;
        if (reward > 0) {
          const { error: creditErr } = await admin.rpc("credit_wallet", { p_user_id: m.user_id, p_amount: reward });
          if (!creditErr) paid++;
        }
        if (tier < 5) { newTier = tier + 1; didPromote = true; }
      } else if (isBottom && tier > 1) {
        newTier = tier - 1; didDemote = true;
      }

      if (didPromote || didDemote) moves++;

      const { error: histErr } = await admin.from("league_xp_history").insert({
        week_start: closingWeek,
        tier,
        user_id: m.user_id,
        display_name: ((m as any).profiles?.display_name || (m as any).profiles?.username) || "Player",
        final_rank: rank,
        final_xp: m.week_start === closingWeek ? m.xp : 0,
        reward_mwk: reward,
        promoted: didPromote,
        demoted: didDemote,
      });
      if (!histErr) snapshots++;

      // Reset for the new cycle (idempotent: week_start guard).
      await admin
        .from("league_xp_members")
        .update({ xp: 0, week_start: newWeek, tier: newTier, updated_at: new Date().toISOString() })
        .eq("user_id", m.user_id)
        .neq("week_start", newWeek);
    }
  }

  return NextResponse.json({ ok: true, closingWeek, newWeek, paid, moves, snapshots });
}
