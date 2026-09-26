import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLeagueXpConfig, currentMonthStart, nextMonthStart } from "@/lib/league-xp";
import { planMonthlySettlement } from "@/lib/league-xp/plan";
import { getExchangeRate } from "@/lib/geo/fx";
import { heldNote } from "@/lib/integrity/detect";
import { COUNTRY_CURRENCY } from "@/lib/geo/currency-map";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Monthly XP settlement — Vercel cron, daily 00:05 CAT (22:05 UTC, see
 * vercel.json). Requires Bearer CRON_SECRET. The daily run self-guards:
 * it only acts on the morning of the 1st, when the previous day was
 * still in the closing month (owner redesign 2026-09-26: ONE cycle,
 * the calendar month).
 *
 * For the closing month, per tier, ranked by monthly XP desc:
 *   - top `monthly_top_count` (default 5) active players of each tier
 *     are credited their tier's rank reward to the wallet (credit_wallet RPC, same path as
 *     battle payouts), in MWK from the monthly reward array
 *   - every player's monthly XP resets for the new cycle and a history
 *     snapshot is written (league_xp_monthly_history) with their
 *     lifetime XP at close — the lifetime total never resets
 *   - lifetime_xp is untouched by the reset
 *
 * Idempotency: members already on the new month key are skipped by the
 * reset guard, monthly history has a unique (month, user_id) index and
 * deposits use a unique reference — re-runs are no-ops, never a double
 * payout.
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
  // 2 hours back from 00:05 crosses the month boundary only on the 1st;
  // every other day is a no-op. (The idempotency guard on the month key
  // additionally prevents double-paying re-runs.)
  const now = new Date();
  const curMonth = currentMonthStart(now);
  const closingMonth = currentMonthStart(new Date(now.getTime() - 2 * 60 * 60 * 1000));
  if (closingMonth === curMonth) {
    return NextResponse.json({ ok: true, skipped: "not at month boundary", month: curMonth });
  }
  const newMonth = curMonth;

  if (!cfg.enabled) {
    return NextResponse.json({ ok: true, skipped: "xp system disabled", month: curMonth });
  }

  const { data: members, error } = await admin
    .from("league_xp_members")
    .select("user_id, tier, xp, week_start, lifetime_xp, profiles!inner(display_name, username)")
    .order("xp", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Decision layer: the pure, unit-tested plan ──────────────────────
  // planMonthlySettlement is the single source of truth for ranking and
  // the payout gate (rewards_enabled + admin kill-switch + the
  // payouts_start date gate). This route only EXECUTES the plan.
  const plan = planMonthlySettlement({
    members: (members ?? []).map((m: any) => ({
      user_id: m.user_id as string,
      tier: m.tier as number,
      xp: Number(m.xp ?? 0),
      cycle_start: m.week_start as string,
      lifetime_xp: Number(m.lifetime_xp ?? 0),
      display_name: (m.profiles?.display_name || m.profiles?.username) || "Player",
    })),
    cfg,
    closingMonth,
    newMonth,
  });
  if (!plan.payOn && plan.unpaidReason) {
    console.log(`[league] monthly payouts OFF for ${closingMonth}: ${plan.unpaidReason}`);
  }

  const fxRates = new Map<string, number>();

  // ── 1) Wallet credits for the paid top ranks ────────────────────────
  // Idempotent: unique deposits reference (league_monthly:<month>:<user>).
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
    const rewardRef = `league_monthly:${closingMonth}:${p.userId}`;
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

  // ── 2) History snapshots (bulk insert, idempotent via the unique
  //       (month, user_id) index) ──────────────────────────────────────
  let snapshots = 0;
  const snapRows = plan.snapshots.map((s) => ({
    month: s.month,
    tier: s.tier,
    user_id: s.user_id,
    display_name: s.display_name,
    final_rank: s.final_rank,
    final_xp: s.final_xp,
    lifetime_xp: s.lifetime_xp,
    reward_mwk: s.reward_mwk,
  }));
  for (let i = 0; i < snapRows.length; i += 500) {
    const { data: inserted, error: histErr } = await admin
      .from("league_xp_monthly_history")
      .upsert(snapRows.slice(i, i + 500), { onConflict: "month,tier,user_id", ignoreDuplicates: true })
      .select("id");
    if (histErr) console.error("[league] monthly history bulk insert failed:", histErr.message);
    else snapshots += inserted?.length ?? 0;
  }

  // ── 3) Reset every member for the new cycle with their POST-MOVE
  //       tier (chunked bulk updates, idempotent via the month-key
  //       guard). Lifetime XP untouched.
  const resetIso = new Date().toISOString();
  for (const [groupTier, ids] of Object.entries(plan.updateGroups)) {
    for (let i = 0; i < ids.length; i += 100) {
      await admin
        .from("league_xp_members")
        .update({ xp: 0, week_start: newMonth, tier: Number(groupTier), updated_at: resetIso })
        .in("user_id", ids.slice(i, i + 100))
        .neq("week_start", newMonth);
    }
  }

  // ── 4) Fair-share rebalance moves (tier only; XP/cycle untouched).
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

  return NextResponse.json({
    ok: true,
    closingMonth,
    newMonth,
    paid,
    ranked: plan.snapshots.length,
    moves: plan.totals.moves,
    movesAuto: plan.movesAuto,
    rebalance: { up: plan.rebalanceUp.length, down: plan.rebalanceDown.length },
    snapshots,
    payoutGate: plan.payOn ? "open" : (plan.unpaidReason ?? "closed"),
    heldForIntegrity: held,
  });
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
