import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLeagueXpConfig, currentWeekStart, currentMonthStart, rewardsForTier, monthlyRewardsForTier } from "@/lib/league-xp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * XP League settlement — Vercel cron, daily 00:05 CAT (22:05 UTC, see
 * vercel.json). Requires Bearer CRON_SECRET. Two independent settles,
 * each self-guarding, so one daily cron covers both:
 *
 * 1. WEEKLY (only fires right after Monday 00:00 CAT):
 *    For each tier, ranked by XP desc:
 *      - top `promote_count` (default 5): credited their rank reward to the
 *        wallet (credit_wallet RPC, same path as battle payouts) and
 *        promoted one tier — but only while the league above has a free
 *        slot (tier_cap, default 1000; the Open League is uncapped).
 *      - demotion is config-driven (`demote_count`, currently 0 —
 *        promotion-only mode: nobody gets pushed down).
 *      - every member's XP resets for the new week and a history snapshot
 *        is written (league_xp_history).
 *    Idempotent guard: members already on the new week are skipped, so a
 *    re-run or overlap with live traffic can never double-pay.
 *
 * 2. MONTHLY (only fires on the 1st, for the month that just closed):
 *    Aggregates league_xp_events over the calendar month, ranks each tier,
 *    pays the top `monthly_top_count` from the per-tier monthly reward
 *    arrays, and snapshots into league_xp_monthly_history. Tiers never
 *    move on the monthly cycle — it's a championship, not a ladder.
 *    Idempotency: unique (month, tier, user_id) history index + unique
 *    deposits reference — re-runs are no-ops.
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

  const result = await runWeeklySettle(admin, cfg);
  const monthly = await runMonthlySettle(admin, cfg);
  return NextResponse.json({ ok: true, ...result, monthly });
}

/** Weekly ladder settle — only acts in the hours right after Monday 00:00 CAT. */
async function runWeeklySettle(
  admin: ReturnType<typeof createAdminClient>,
  cfg: Awaited<ReturnType<typeof getLeagueXpConfig>>
) {
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
    return { skipped: "not at week boundary", week: curWeek };
  }
  const newWeek = curWeek;

  const { data: members, error } = await admin
    .from("league_xp_members")
    .select("user_id, tier, xp, week_start, profiles!inner(display_name, username)")
    .order("xp", { ascending: false })
    .order("updated_at", { ascending: true });
  if (error) return { error: error.message };

  const promoted = cfg.promote_count;
  const demoted = cfg.demote_count;
  const cap = cfg.tier_cap > 0 ? cfg.tier_cap : Infinity; // 0/absent = uncapped
  let paid = 0, moves = 0, snapshots = 0, capped = 0;

  // Rank within each tier: active members first (by xp desc — the select is
  // already ordered), then anyone whose row predates the closing cycle
  // (no games this week → 0 XP by definition, still reset and eligible
  // for demotion).
  for (const tier of [1, 2, 3, 4, 5]) {
    // Configurable payout per league — each tier has its own reward set.
    const rewards = cfg.rewards_enabled ? rewardsForTier(cfg, tier) : [0, 0, 0, 0, 0];
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

  return { closingWeek, newWeek, paid, moves, snapshots, cappedAtCapacity: capped };
}

/**
 * Monthly championship settle — only acts on the 1st of the month.
 * Ranks each tier by XP earned during the month that just closed and
 * pays the configured monthly rewards. No promotion/demotion.
 */
async function runMonthlySettle(
  admin: ReturnType<typeof createAdminClient>,
  cfg: Awaited<ReturnType<typeof getLeagueXpConfig>>
) {
  const now = new Date();
  const closingMonth = currentMonthStart(new Date(now.getTime() - 6 * 60 * 60 * 1000));
  const curMonth = currentMonthStart(now);
  if (closingMonth === curMonth) {
    return { skipped: "not at month boundary", month: curMonth };
  }

  // Already settled this month? Unique history index makes re-runs no-ops,
  // but skip the work entirely if a snapshot exists.
  const { count } = await admin
    .from("league_xp_monthly_history")
    .select("id", { count: "exact", head: true })
    .eq("month", closingMonth);
  if (count && count > 0) {
    return { skipped: "already settled", month: closingMonth };
  }

  // Aggregate the month's XP from the events audit log.
  const monthStartIso = closingMonth + "T00:00:00+02:00";
  const monthEndIso = curMonth + "T00:00:00+02:00";
  const { data: events, error: evErr } = await admin
    .from("league_xp_events")
    .select("user_id, amount")
    .gte("created_at", monthStartIso)
    .lt("created_at", monthEndIso);
  if (evErr) return { error: evErr.message };

  const xpByUser = new Map<string, number>();
  for (const ev of events ?? []) {
    xpByUser.set(ev.user_id, (xpByUser.get(ev.user_id) ?? 0) + ev.amount);
  }
  if (xpByUser.size === 0) return { closingMonth, paid: 0, ranked: 0, snapshots: 0 };

  const { data: members } = await admin
    .from("league_xp_members")
    .select("user_id, tier, profiles!inner(display_name, username)");

  const topCount = cfg.monthly_top_count ?? 5;
  let paid = 0, ranked = 0, snapshots = 0;

  for (const tier of [1, 2, 3, 4, 5]) {
    const rewards = cfg.monthly_rewards_enabled !== false && cfg.rewards_enabled
      ? monthlyRewardsForTier(cfg, tier)
      : [];
    const rows = (members ?? [])
      .filter((m: any) => m.tier === tier && xpByUser.has(m.user_id))
      .map((m: any) => ({
        user_id: m.user_id,
        xp: xpByUser.get(m.user_id) ?? 0,
        name: m.profiles?.display_name || m.profiles?.username || "Player",
      }))
      .sort((a: any, b: any) => b.xp - a.xp)
      .slice(0, Math.max(topCount, 20)); // snapshot a bit beyond the paid zone

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const rank = i + 1;
      const inPaidZone = rank <= topCount && r.xp > 0;
      const reward = inPaidZone ? rewards[rank - 1] ?? 0 : 0;
      ranked++;

      if (reward > 0) {
        const rewardRef = `league_monthly:${closingMonth}:${r.user_id}`;
        const { error: depErr } = await admin.from("deposits").insert({
          user_id: r.user_id,
          amount: reward,
          status: "success",
          method: "league_reward",
          reference: rewardRef,
        });
        if (depErr && String(depErr.message || "").includes("duplicate key")) {
          // Already paid in a previous run — no-op.
        } else if (!depErr) {
          const { error: creditErr } = await admin.rpc("credit_wallet", { p_user_id: r.user_id, p_amount: reward });
          if (!creditErr) {
            paid++;
          } else {
            await admin.from("deposits").delete().eq("reference", rewardRef);
            console.error(`Monthly league reward credit failed for ${r.user_id}, ledger row rolled back`);
          }
        } else {
          console.error("Monthly league reward ledger insert failed:", depErr);
        }
      }

      const { error: histErr } = await admin.from("league_xp_monthly_history").insert({
        month: closingMonth,
        tier,
        user_id: r.user_id,
        display_name: r.name,
        final_rank: rank,
        final_xp: r.xp,
        reward_mwk: reward,
      });
      if (!histErr) snapshots++;
    }
  }

  return { closingMonth, paid, ranked, snapshots };
}
