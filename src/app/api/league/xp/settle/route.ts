import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLeagueXpConfig, currentWeekStart, rewardsArray } from "@/lib/league-xp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Weekly XP League settlement — Vercel cron, Mondays 00:05 CAT
 * (Sunday 22:05 UTC, see vercel.json). Requires Bearer CRON_SECRET.
 *
 * For each tier, ranked by XP desc:
 *   - top `promote_count` (default 5): credited their rank reward to the
 *     wallet (credit_wallet RPC, same path as battle payouts) and
 *     promoted one tier — but only while the league above has a free
 *     slot (tier_cap, default 1000; the Open League is uncapped).
 *   - demotion is config-driven (`demote_count`, currently 0 —
 *     promotion-only mode: nobody gets pushed down).
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

  // ── Boundary guard ───────────────────────────────────────────────────
  // Settlement is only valid in the hours right after Monday 00:00 CAT.
  // Anywhere else in the week we would be settling the LIVE week —
  // paying mid-week and wiping everyone's XP. So: only run when "6 hours
  // ago" falls in the previous cycle. (The idempotency guard on
  // week_start additionally prevents double-paying re-runs.)
  const now = new Date();
  const curWeek = currentWeekStart(now);
  const closingWeek = currentWeekStart(new Date(now.getTime() - 6 * 60 * 60 * 1000));
  if (closingWeek === curWeek) {
    return NextResponse.json({ ok: true, skipped: "not at cycle boundary", week: curWeek });
  }
  const newWeek = curWeek;
  const rewards = cfg.rewards_enabled ? rewardsArray(cfg) : [0, 0, 0, 0, 0];

  const { data: members, error } = await admin
    .from("league_xp_members")
    .select("user_id, tier, xp, week_start, profiles!inner(display_name, username)")
    .order("xp", { ascending: false })
    .order("updated_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const promoted = cfg.promote_count;
  const demoted = cfg.demote_count;
  const cap = cfg.tier_cap > 0 ? cfg.tier_cap : Infinity; // 0/absent = uncapped
  let paid = 0, moves = 0, snapshots = 0, capped = 0;

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
    // Current roster size of the league above — promotion only proceeds
    // while it has free slots under tier_cap. (Tier 5 never promotes.)
    const destRoster = (members ?? []).filter((m) => m.tier === tier + 1).length;
    let room = Math.max(0, cap - destRoster);

    for (let i = 0; i < n; i++) {
      const m = ranked[i];
      const rank = i + 1;
      const isTop = rank <= promoted && m.week_start === closingWeek && m.xp > 0;
      const isBottom = m.week_start === closingWeek && demoted > 0 && n > promoted + demoted && rank > n - demoted;

      let reward = 0;
      let newTier = m.tier;
      let didPromote = false, didDemote = false;

      if (isTop) {
        reward = rewards[rank - 1] ?? 0;
        if (reward > 0) {
          // Idempotency: ledger row FIRST with a unique reference. The
          // deposits_reference_unique partial index turns any crash/retry
          // into a no-op instead of a double payout.
          const rewardRef = `league:${closingWeek}:${m.user_id}`;
          const { error: depErr } = await admin.from("deposits").insert({
            user_id: m.user_id,
            amount: reward,
            status: "success",
            method: "league_reward",
            reference: rewardRef,
          });
          if (depErr && String(depErr.message || "").includes("duplicate key")) {
            // Already paid in a previous run — skip.
          } else if (!depErr) {
            const { error: creditErr } = await admin.rpc("credit_wallet", { p_user_id: m.user_id, p_amount: reward });
            if (!creditErr) {
              paid++;
            } else {
              // Roll back the ledger claim so a retry can pay properly.
              await admin.from("deposits").delete().eq("reference", rewardRef);
              console.error(`League reward credit failed for ${m.user_id}, ledger row rolled back`);
            }
          } else {
            console.error("League reward ledger insert failed:", depErr);
          }
        }
        if (tier < 5 && room > 0) { newTier = tier + 1; didPromote = true; room--; }
        else if (tier < 5 && room <= 0) capped++;
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

  return NextResponse.json({ ok: true, closingWeek, newWeek, paid, moves, snapshots, cappedAtCapacity: capped });
}
