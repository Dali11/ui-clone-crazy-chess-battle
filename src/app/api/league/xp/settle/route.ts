import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLeagueXpConfig, currentWeekStart, currentMonthStart, rewardsForTier, monthlyRewardsForTier, CAT_OFFSET_MS } from "@/lib/league-xp";
import { getExchangeRate } from "@/lib/geo/fx";
import { COUNTRY_CURRENCY } from "@/lib/geo/currency-map";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * XP League settlement — Vercel cron, daily 00:05 CAT (22:05 UTC, see
 * vercel.json). Requires Bearer CRON_SECRET. Two independent settles,
 * each self-guarding, so one daily cron covers both:
 *
 * 1. WEEKLY (fires the morning after each calendar week closes — the
 *    8th, 15th, 22nd and 1st — owner policy 2026-09-11). Wallet
 *    credits are gated on rewards_enabled AND weekly_payouts_enabled —
 *    the kill-switch that keeps the league visibly running while no
 *    money moves:
 *    For each tier, ranked by XP desc:
 *      - top `promote_count` (default 5): credited their rank reward to the
 *        wallet (credit_wallet RPC, same path as battle payouts). Tier
 *        movement (one tier up) happens only while tier_moves_enabled is
 *        on AND the league above has a free slot (tier_cap, default
 *        1000; the Open League is uncapped) — currently OFF while the
 *        player base grows; the fair-share rebalance moves rosters.
 *      - demotion is config-driven (`demote_count`) and also gated on
 *        tier_moves_enabled.
 *      - every member's XP resets for the new week and a history snapshot
 *        is written (league_xp_history).
 *      - FAIR-SHARE REBALANCE (owner policy 2026-09-11): after the
 *        standard moves, any roster drift from the even share (total / 5
 *        per league) is corrected in one wave — Open's surplus rides up
 *        (XP earners only), over-shared leagues shed their bottom. Only
 *        fires at drift ≥ 5; cash rewards are unaffected.
 *    Idempotent guard: members already on the new week are skipped, so a
 *    re-run or overlap with live traffic can never double-pay.
 *
 * 2. MONTHLY (fires on the 30th / last day of short months, only when
 *    the admin toggle is on): Aggregates league_xp_events month-to-date,
 *    ranks each tier,
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

/**
 * Weekly ladder settle — runs daily at 00:05 CAT, but only acts on the
 * morning after a calendar week closes (the 8th, 15th, 22nd and 1st).
 * Owner policy 2026-09-11: weeks are date-anchored — 1st–7th, 8th–14th,
 * 15th–21st, 22nd–month end — and payouts land the morning after close.
 */
async function runWeeklySettle(
  admin: ReturnType<typeof createAdminClient>,
  cfg: Awaited<ReturnType<typeof getLeagueXpConfig>>
) {
  // ── Boundary guard ───────────────────────────────────────────────────
  // 2 hours back from 00:05 crosses the week boundary only on the day
  // after a week closes; every other day is a no-op. (The idempotency
  // guard on week_start additionally prevents double-paying re-runs.)
  const now = new Date();
  const curWeek = currentWeekStart(now);
  const closingWeek = currentWeekStart(new Date(now.getTime() - 2 * 60 * 60 * 1000));
  if (closingWeek === curWeek) {
    return { skipped: "not at week boundary", week: curWeek };
  }
  const newWeek = curWeek;

  const { data: members, error } = await admin
    .from("league_xp_members")
    .select("user_id, tier, xp, week_start, profiles!inner(display_name, username)")
    .order("xp", { ascending: false })
    .order("updated_at", { ascending: true });
  const fxRates = new Map<string, number>();
  if (error) return { error: error.message };

  const promoted = cfg.promote_count;
  const demoted = cfg.demote_count;
  // Owner policy 2026-09-11: standard 5-up/5-down is built in but
  // switched OFF while the player base grows — the fair-share rebalance
  // below is the only thing that moves players between leagues. Cash
  // rewards still pay the top N every week. Flip tier_moves_enabled on
  // when Premier approaches the 1k cap.
  const movesOn = cfg.tier_moves_enabled === true;
  // Final tier per member after the standard moves (for the fair-share
  // rebalance below) + players who already moved this run (never moved
  // twice in one settle).
  const finalTier = new Map<string, number>();
  const movedUsers = new Set<string>();
  const cap = cfg.tier_cap > 0 ? cfg.tier_cap : Infinity; // 0/absent = uncapped
  // Owner policy 2026-09-11: weekly_payouts_enabled is the payout
  // kill-switch — the league, XP and leaderboard keep running and
  // players still see reward amounts in the UI; only wallet credits
  // stop. OFF for the first partial week (Season 1 began 2026-09-11);
  // first real payout: the settle on 2026-09-22.
  const payOn = cfg.rewards_enabled && cfg.weekly_payouts_enabled !== false;
  let paid = 0, moves = 0, snapshots = 0, capped = 0;
  // AUDIT FIX 2026-09-11: bulk processing. The old per-member awaits
  // (~2 queries x 472+ members) blow past the 60s serverless limit as the
  // player base grows, leaving a half-settled week that can't re-run
  // until the NEXT boundary. History rows are now collected and bulk-
  // upserted (idempotent via the unique (week_start, user_id) index), and
  // member resets are grouped by resulting tier into chunked bulk updates.
  const historyRows: any[] = [];
  const updateGroups = new Map<number, string[]>();

  // Rank within each tier: active members first (by xp desc — the select is
  // already ordered), then anyone whose row predates the closing cycle
  // (no games this week → 0 XP by definition, still reset and eligible
  // for demotion).
  for (const tier of [1, 2, 3, 4, 5]) {
    // Configurable payout per league — each tier has its own reward set.
    const rewards = payOn ? rewardsForTier(cfg, tier) : [0, 0, 0, 0, 0];
    const tierMembers = (members ?? []).filter((m) => m.tier === tier);
    const active = tierMembers.filter((m) => m.week_start === closingWeek);
    // Nobody played in this league this week — nothing to settle, no
    // phantom snapshots (e.g. the pre-season weeks before the first
    // real cycle closes).
    if (active.length === 0) continue;
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
          const fxNote = await fxNoteFor(admin, m.user_id, reward, fxRates);
          const { error: depErr } = await admin.from("deposits").insert({
            user_id: m.user_id,
            amount: reward,
            status: "success",
            method: "league_reward",
            reference: rewardRef,
            admin_notes: fxNote,
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
        if (movesOn && tier < 5 && room > 0) { newTier = tier + 1; didPromote = true; room--; }
        else if (movesOn && tier < 5 && room <= 0) capped++;
      } else if (isBottom && movesOn && tier > 1) {
        newTier = tier - 1; didDemote = true;
      }

      finalTier.set(m.user_id, newTier);
      if (didPromote || didDemote) { moves++; movedUsers.add(m.user_id); }

      historyRows.push({
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
      const group = updateGroups.get(newTier) ?? [];
      group.push(m.user_id);
      updateGroups.set(newTier, group);
    }
  }

  // ── Bulk: history snapshots + member resets (idempotent) ────────────
  for (let i = 0; i < historyRows.length; i += 500) {
    const { data: inserted, error: histErr } = await admin
      .from("league_xp_history")
      .upsert(historyRows.slice(i, i + 500), { onConflict: "week_start,user_id", ignoreDuplicates: true })
      .select("id");
    if (histErr) console.error("[league] history bulk insert failed:", histErr.message);
    else snapshots += inserted?.length ?? 0;
  }
  const resetIso = new Date().toISOString();
  for (const [groupTier, ids] of updateGroups) {
    for (let i = 0; i < ids.length; i += 100) {
      await admin
        .from("league_xp_members")
        .update({ xp: 0, week_start: newWeek, tier: groupTier, updated_at: resetIso })
        .in("user_id", ids.slice(i, i + 100))
        .neq("week_start", newWeek);
    }
  }

  // ── Fair-share rebalance (owner policy 2026-09-11) ────────────────────
  // Dynamic promotion: after the standard top-5/bottom-5 moves, if the
  // rosters have drifted from the even share (total / 5 per league, the
  // top leagues take the remainder), move the difference in one wave —
  // Open's surplus rides up the chain (only players who earned XP this
  // week ride the wave), over-shared leagues shed their bottom back
  // down (inactive players go first). Only fires when drift ≥ 5, so a
  // normal week is unchanged. Cash rewards never change: only the
  // standard top 5 per league get paid, no matter how many players
  // move. Idempotent by construction — after one rebalance the counts
  // sit at the fair-share fixed point, so a re-run is a no-op.
  {
    const all = (members ?? []).map((m: any) => ({
      user_id: m.user_id as string,
      tier: (finalTier.get(m.user_id) ?? m.tier) as number,
      earned: m.week_start === closingWeek && (m.xp ?? 0) > 0,
      // Sort key: active players rank by this week's XP; inactive rows
      // sink below every 0-XP player so dead accounts demote first.
      xp: m.week_start === closingWeek ? (m.xp ?? 0) : -1,
    }));
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const m of all) counts[m.tier]++;
    const total = all.length;
    const base = Math.floor(total / 5);
    const rem = total % 5;
    const targets: Record<number, number> = {
      1: base,
      2: base + (rem > 3 ? 1 : 0),
      3: base + (rem > 2 ? 1 : 0),
      4: base + (rem > 1 ? 1 : 0),
      5: base + (rem > 0 ? 1 : 0),
    };
    const nowIso = new Date().toISOString();
    const pool = (t: number) => all.filter((m) => m.tier === t && !movedUsers.has(m.user_id)).sort((a, b) => b.xp - a.xp);

    // Top-down demotion: leagues over their fair share shed their bottom.
    let rebalancedDown = 0;
    for (let t = 5; t >= 2; t--) {
      const excess = counts[t] - targets[t];
      if (excess < 5) continue;
      const bottom = pool(t).slice().reverse().slice(0, excess);
      if (bottom.length === 0) continue;
      await admin
        .from("league_xp_members")
        .update({ tier: t - 1, updated_at: nowIso })
        .in("user_id", bottom.map((m) => m.user_id));
      rebalancedDown += bottom.length;
      counts[t] -= bottom.length;
      counts[t - 1] += bottom.length;
    }

    // Bottom-up promotion: Open's surplus rides up the chain, absorbed
    // by each league's shortfall. Only XP earners ride the wave.
    let rebalancedUp = 0;
    let inflow = Math.max(0, counts[1] - targets[1]);
    if (inflow >= 5) {
      for (let t = 2; t <= 5 && inflow > 0; t++) {
        const room = Math.max(0, cap - counts[t]);
        if (room <= 0) break; // chain blocked at a full league
        const eligible = pool(t - 1).filter((m) => m.earned);
        const move = Math.min(inflow, eligible.length, room);
        if (move <= 0) break;
        const wave = eligible.slice(0, move);
        await admin
          .from("league_xp_members")
          .update({ tier: t, updated_at: nowIso })
          .in("user_id", wave.map((m) => m.user_id));
        rebalancedUp += move;
        counts[t - 1] -= move;
        counts[t] += move;
        for (const m of wave) { m.tier = t; movedUsers.add(m.user_id); }
        const shortBy = Math.max(0, targets[t] - (counts[t] - move));
        inflow = move - Math.min(move, shortBy);
      }
    }
    if (rebalancedUp || rebalancedDown) {
      console.log(`[league] fair-share rebalance: ${rebalancedUp} up, ${rebalancedDown} down`);
    }
    return { closingWeek, newWeek, paid, moves, snapshots, cappedAtCapacity: capped, rebalancedUp, rebalancedDown };
  }
}

/**
 * Owner policy 2026-09-11: players are paid the equivalent of their MWK
 * reward in their own currency at the prevailing FX rate. Wallets hold
 * MWK value, so the credit is the MWK amount and the ledger row records
 * the prevailing rate + the player-currency equivalent for payout time.
 * Rates are memoized per settle run (one FX call per currency).
 */
async function fxNoteFor(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  rewardMwk: number,
  rates: Map<string, number>
): Promise<string | null> {
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("country")
      .eq("id", userId)
      .maybeSingle();
    const currency = COUNTRY_CURRENCY[(profile?.country || "MW").toUpperCase()] || "MWK";
    if (currency === "MWK") return null;
    if (!rates.has(currency)) {
      rates.set(currency, await getExchangeRate("MWK", currency));
    }
    const rate = rates.get(currency) ?? 1;
    if (!rate || rate === 1) return null;
    const converted = Math.round(rewardMwk * rate * 100) / 100;
    return `FX payout: ${rewardMwk.toLocaleString()} MWK ≈ ${converted.toLocaleString()} ${currency} @ ${rate}`;
  } catch {
    return null;
  }
}

/**
 * Monthly championship settle — pays out on the 30th of each month (or the
 * last day of shorter months). Ranks each tier by XP earned month-to-date
 * and pays the configured monthly rewards. No promotion/demotion. Fully
 * gated on the admin "Monthly Championship Enabled" toggle.
 */
async function runMonthlySettle(
  admin: ReturnType<typeof createAdminClient>,
  cfg: Awaited<ReturnType<typeof getLeagueXpConfig>>
) {
  // Monthly PAYOUTS are admin-configurable (platform_settings → XP
  // Leagues → Monthly Championship Enabled). Owner policy 2026-09-11:
  // payouts disabled for now — the monthly RANKINGS keep running, only
  // the cash payouts are skipped.
  if (cfg.monthly_rewards_enabled === false || cfg.rewards_enabled === false) {
    return { skipped: "monthly payouts disabled in admin settings" };
  }

  // Owner policy 2026-09-11: the monthly championship pays out on the
  // 30th (last day for shorter months) — the rankings cover the whole
  // month-to-date at payout time.
  const now = new Date();
  const catNow = new Date(now.getTime() + CAT_OFFSET_MS);
  const catDay = catNow.getUTCDate();
  const daysInMonth = new Date(Date.UTC(catNow.getUTCFullYear(), catNow.getUTCMonth() + 1, 0)).getUTCDate();
  const isLastDay = catDay === daysInMonth;
  if (catDay !== 30 && !(catDay < 30 && isLastDay)) {
    return { skipped: "monthly settle only runs on the 30th (CAT)" };
  }
  const closingMonth = currentMonthStart(now);

  // Already settled this month? Unique history index makes re-runs no-ops,
  // but skip the work entirely if a snapshot exists.
  const { count } = await admin
    .from("league_xp_monthly_history")
    .select("id", { count: "exact", head: true })
    .eq("month", closingMonth);
  if (count && count > 0) {
    return { skipped: "already settled", month: closingMonth };
  }

  // Aggregate the month's XP from the events audit log. Season 1 began
  // 2026-09-11 — the first championship month only counts XP from then.
  const cycleStart = (cfg.season_start && cfg.season_start > closingMonth)
    ? cfg.season_start
    : closingMonth;
  const monthStartIso = cycleStart + "T00:00:00+02:00";
  // The championship pays on the 30th, so the window closes NOW — the
  // ranking covers month-to-date at payout time.
  const monthEndIso = now.toISOString();
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
  const fxRates = new Map<string, number>();

  for (const tier of [1, 2, 3, 4, 5]) {
    // (monthly_rewards_enabled already checked by the early return above)
    const rewards = cfg.rewards_enabled ? monthlyRewardsForTier(cfg, tier) : [];
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
        const fxNote = await fxNoteFor(admin, r.user_id, reward, fxRates);
        const { error: depErr } = await admin.from("deposits").insert({
          user_id: r.user_id,
          amount: reward,
          status: "success",
          method: "league_reward",
          reference: rewardRef,
          admin_notes: fxNote,
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
