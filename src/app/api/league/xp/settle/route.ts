import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLeagueXpConfig, currentWeekStart, currentMonthStart, monthlyRewardsForTier, CAT_OFFSET_MS } from "@/lib/league-xp";
import { planWeeklySettlement } from "@/lib/league-xp/plan";
import { getExchangeRate } from "@/lib/geo/fx";
import { heldNote } from "@/lib/integrity/detect";
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
 *        (XP earners first, then a best-of-rest fallback — owner 2026-09-15;
 *        over-shared leagues shed their bottom). Only
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
  if (error) return { error: error.message };

  // ── USD->MWK rate for dollar-denominated rewards ─────────────────────
  // Best-effort live fetch, falling back to the DB-cached inverse rate.
  // planWeeklySettlement sanity-checks the value (500-5000 band) and
  // refuses to pay rather than mis-credit if both sources are stale.
  let usdToMwk = 0;
  if (cfg.rewards_currency === "USD") {
    usdToMwk = await getExchangeRate("USD", "MWK");
    if (!usdToMwk || usdToMwk === 1) {
      const { data: dbRate } = await admin
        .from("exchange_rates")
        .select("rate")
        .eq("base_currency", "MWK")
        .eq("target_currency", "USD")
        .single();
      const inv = dbRate?.rate ? 1 / Number(dbRate.rate) : 0;
      if (inv > 0) usdToMwk = inv;
    }
  }

  // ── Decision layer: the pure, unit-tested plan ───────────────────────
  // planWeeklySettlement is the single source of truth for ranking, the
  // payout gate (rewards_enabled + admin kill-switch + the payouts_start
  // date gate — the "automation in code" that turns paying on for the
  // first eligible week with no external scheduler), standard moves and
  // the fair-share rebalance. This route only EXECUTES the plan.
  const plan = planWeeklySettlement({
    members: (members ?? []).map((m: any) => ({
      user_id: m.user_id as string,
      tier: m.tier as number,
      xp: (m.xp ?? 0) as number,
      week_start: m.week_start as string,
      display_name: (m.profiles?.display_name || m.profiles?.username) || "Player",
    })),
    cfg,
    closingWeek,
    newWeek,
    usdToMwk,
  });
  if (!plan.payOn && plan.unpaidReason) {
    console.log(`[league] payouts OFF for ${closingWeek}: ${plan.unpaidReason}`);
  }

  const fxRates = new Map<string, number>();

  // ── 1) Wallet credits for the paid top ranks ────────────────────────
  // Idempotent: unique deposits reference (league:<week>:<user>) — a
  // crash/retry/re-run is a no-op, never a double payout.
  //
  // INTEGRITY HOLD: players with OPEN integrity flags (anti-cheat, see
  // Admin → Integrity) get their payout parked as a 'pending' deposit
  // with a HELD note — the wallet is NOT credited. Dismissing the flag
  // in the admin panel releases every held payout with one click.
  const { data: openFlags } = await admin
    .from("integrity_flags")
    .select("user_id, type")
    .eq("status", "open");
  const heldTypes = new Map<string, string[]>();
  for (const f of openFlags ?? []) {
    const list = heldTypes.get(f.user_id) ?? [];
    list.push(f.type);
    heldTypes.set(f.user_id, list);
  }

  let paid = 0;
  const held: { userId: string; rewardMwk: number; types: string[] }[] = [];
  for (const p of plan.payouts) {
    const rewardRef = `league:${plan.closingWeek}:${p.userId}`;
    const fxNote = await fxNoteFor(admin, p.userId, p.rewardMwk, fxRates);
    const flagTypes = heldTypes.get(p.userId);
    if (flagTypes?.length) {
      // Park the payout as pending (ledger claim — no double on re-run)
      // and skip the wallet credit until an admin resolves the flags.
      const { error: holdErr } = await admin.from("deposits").insert({
        user_id: p.userId,
        amount: p.rewardMwk,
        status: "pending",
        method: "league_reward",
        reference: rewardRef,
        admin_notes: `${heldNote(flagTypes)} — ${fxNote}`,
      });
      if (holdErr && !String(holdErr.message || "").includes("duplicate key")) {
        console.error("League reward HOLD insert failed:", holdErr);
      } else if (!holdErr) {
        held.push({ userId: p.userId, rewardMwk: p.rewardMwk, types: flagTypes });
        console.log(`[league] payout HELD for ${p.userId} (${flagTypes.join(", ")})`);
      }
      continue;
    }
    const { error: depErr } = await admin.from("deposits").insert({
      user_id: p.userId,
      amount: p.rewardMwk,
      status: "success",
      method: "league_reward",
      reference: rewardRef,
      admin_notes: fxNote,
    });
    if (depErr && String(depErr.message || "").includes("duplicate key")) {
      // Already paid in a previous run — skip.
    } else if (!depErr) {
      const { error: creditErr } = await admin.rpc("credit_wallet", { p_user_id: p.userId, p_amount: p.rewardMwk });
      if (!creditErr) {
        paid++;
      } else {
        // Roll back the ledger claim so a retry can pay properly.
        await admin.from("deposits").delete().eq("reference", rewardRef);
        console.error(`League reward credit failed for ${p.userId}, ledger row rolled back`);
      }
    } else {
      console.error("League reward ledger insert failed:", depErr);
    }
  }

  // ── 2) History snapshots (bulk upsert, idempotent via the unique
  //       (week_start, user_id) index) ──────────────────────────────────
  let snapshots = 0;
  for (let i = 0; i < plan.snapshots.length; i += 500) {
    const { data: inserted, error: histErr } = await admin
      .from("league_xp_history")
      .upsert(plan.snapshots.slice(i, i + 500), { onConflict: "week_start,user_id", ignoreDuplicates: true })
      .select("id");
    if (histErr) console.error("[league] history bulk insert failed:", histErr.message);
    else snapshots += inserted?.length ?? 0;
  }

  // ── 3) Reset every member for the new cycle (chunked bulk updates,
  //       idempotent via the week_start guard) ───────────────────────────
  const resetIso = new Date().toISOString();
  for (const [groupTier, ids] of Object.entries(plan.updateGroups)) {
    for (let i = 0; i < ids.length; i += 100) {
      await admin
        .from("league_xp_members")
        .update({ xp: 0, week_start: newWeek, tier: Number(groupTier), updated_at: resetIso })
        .in("user_id", ids.slice(i, i + 100))
        .neq("week_start", newWeek);
    }
  }

  // ── 4) Fair-share rebalance moves (tier only; XP/week untouched).
  //       Runs after the resets, same as the original inline logic.
  const rebalanceByDest = new Map<number, string[]>();
  for (const mv of [...plan.rebalanceDown, ...plan.rebalanceUp]) {
    const g = rebalanceByDest.get(mv.toTier) ?? [];
    g.push(mv.userId);
    rebalanceByDest.set(mv.toTier, g);
  }
  for (const [destTier, ids] of rebalanceByDest) {
    for (let i = 0; i < ids.length; i += 100) {
      await admin
        .from("league_xp_members")
        .update({ tier: destTier, updated_at: resetIso })
        .in("user_id", ids.slice(i, i + 100));
    }
  }
  if (plan.rebalanceUp.length || plan.rebalanceDown.length) {
    console.log(`[league] fair-share rebalance: ${plan.rebalanceUp.length} up, ${plan.rebalanceDown.length} down`);
  }

  return {
    closingWeek,
    newWeek,
    paid,
    moves: plan.totals.moves,
    snapshots,
    cappedAtCapacity: plan.totals.capped,
    rebalancedUp: plan.rebalanceUp.length,
    rebalancedDown: plan.rebalanceDown.length,
    payoutGate: plan.payOn ? "open" : (plan.unpaidReason ?? "closed"),
    heldForIntegrity: held,
  };
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
