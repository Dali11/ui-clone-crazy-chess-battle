import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";
import { detectOperator, AIRTEL_OPERATOR_ID, TNM_OPERATOR_ID } from "@/lib/operator";

/**
 * Weekly platform revenue sweep.
 *
 * Platform revenue is IMPLICIT in the ledger: battle fees are the gap between
 * the escrowed pot and the winner payout (both stakes debited, only
 * pot-minus-fee credited back), and withdrawal fees are debited from players
 * but never credited to anyone. Nothing "accumulates" in a wallet — the sweep
 * quantifies it per window and moves it to the owner:
 *
 *   1. compute fees earned since the last CREDITED sweep (first sweep starts
 *      at the configured epoch, default 2026-09-01)
 *   2. credit the owner's in-app wallet (credit_wallet RPC + deposits ledger)
 *   3. create a withdrawal to the owner's configured mobile-money number
 *   4. if auto_payout is on, execute the payout immediately (PayChangu MW /
 *      PawaPay); otherwise the withdrawal sits pending for one-click approval
 *
 * Sweep rows only advance the window when credited=true — below-min and
 * disabled runs are logged but the revenue carries into the next window.
 */

export interface SweepWindow {
  startISO: string;
  endISO: string;
}

export interface WindowRevenue {
  battleFees: number;
  withdrawalFees: number;
  membershipRevenue: number;
  total: number;
}

// ─── Pure helpers (unit-tested) ─────────────────────────────────────────────

/** Battle fee for a settled decisive battle: pot minus what the winner got. */
export function battleFee(stake: number | null, winnerPayout: number | null): number {
  const pot = (stake || 0) * 2;
  const payout = winnerPayout || 0;
  return Math.max(0, pot - payout);
}

/** Sum revenue from raw rows (battles + completed non-Ontech withdrawals + memberships). */
export function computeRevenueFromRows(
  battles: { stake: number | null; winner_payout: number | null }[],
  withdrawals: { fee: number | null }[],
  membershipPurchases: { amount: number | null }[] = []
): WindowRevenue {
  const battleFees = battles.reduce((sum, b) => sum + battleFee(b.stake, b.winner_payout), 0);
  const withdrawalFees = withdrawals.reduce((sum, w) => sum + Math.max(0, w.fee || 0), 0);
  const membershipRevenue = membershipPurchases.reduce((sum, m) => sum + Math.max(0, m.amount || 0), 0);
  return { battleFees, withdrawalFees, membershipRevenue, total: battleFees + withdrawalFees + membershipRevenue };
}

/** Decide what a sweep should do given config + computed revenue. */
export function decideSweep(
  enabled: boolean,
  total: number,
  minMwk: number
): { action: "disabled" | "below_min" | "sweep" } {
  if (!enabled) return { action: "disabled" };
  if (total <= 0 || total < Math.max(0, minMwk)) return { action: "below_min" };
  return { action: "sweep" };
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

export async function computeWindowRevenue(
  admin: ReturnType<typeof createAdminClient>,
  window: SweepWindow
): Promise<WindowRevenue> {
  const [battlesRes, withdrawalsRes, membershipRes] = await Promise.all([
    admin
      .from("battles")
      .select("stake, winner_payout")
      .eq("settled", true)
      .eq("status", "completed")
      .not("winner_id", "is", null)
      .gte("completed_at", window.startISO)
      .lt("completed_at", window.endISO),
    admin
      .from("withdrawals")
      .select("fee, payment_provider")
      .eq("status", "completed")
      .gt("fee", 0)
      .gte("processed_at", window.startISO)
      .lt("processed_at", window.endISO),
    // Membership purchases: player cash → platform PayChangu account (revenue)
    admin
      .from("deposits")
      .select("amount")
      .eq("method", "membership_purchase")
      .eq("status", "success")
      .gte("created_at", window.startISO)
      .lt("created_at", window.endISO)
  ]);

  // Withdrawal fees: MWK-denominated rows only — Ontech ZM rows store ZMW fees
  const withdrawalFees = (withdrawalsRes.data || [])
    .filter((w) => w.payment_provider !== "ontech")
    .reduce((sum, w) => sum + Math.max(0, w.fee || 0), 0);
  const battleFees = (battlesRes.data || []).reduce(
    (sum, b) => sum + battleFee(b.stake, b.winner_payout),
    0
  );
  const membershipRevenue = (membershipRes.data || []).reduce(
    (sum, m) => sum + Math.max(0, m.amount || 0),
    0
  );
  return { battleFees, withdrawalFees, membershipRevenue, total: battleFees + withdrawalFees + membershipRevenue };
}

/** Window = last CREDITED sweep's end → now (revenue from skipped runs carries). */
export async function nextWindow(
  admin: ReturnType<typeof createAdminClient>,
  epoch: string
): Promise<SweepWindow> {
  const { data: last } = await admin
    .from("platform_revenue_sweeps")
    .select("window_end")
    .eq("credited", true)
    .order("window_end", { ascending: false })
    .limit(1);
  const startISO = last?.[0]?.window_end || epoch || "2026-09-01T00:00:00.000Z";
  return { startISO, endISO: new Date().toISOString() };
}

// ─── The sweep ──────────────────────────────────────────────────────────────

export interface SweepResult {
  ok: boolean;
  action: "disabled" | "below_min" | "already_swept" | "no_owner" | "sweep";
  windowStart?: string;
  windowEnd?: string;
  battleFees?: number;
  withdrawalFees?: number;
  membershipRevenue?: number;
  total?: number;
  credited?: boolean;
  payoutStatus?: string;
  withdrawalId?: string;
  message?: string;
}

export async function runRevenueSweep(opts: {
  force?: boolean;
  dry?: boolean;
}): Promise<SweepResult> {
  const admin = createAdminClient();
  const cfg = await getPlatformConfig(admin, "revenue_sweep");

  if (!cfg.enabled && !opts.force) return { ok: true, action: "disabled" };

  // Weekly cadence guard: cron may fire more than once a week (manual runs,
  // re-deploys) — skip if a credited sweep happened in the last 6 days.
  if (!opts.force) {
    const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recent } = await admin
      .from("platform_revenue_sweeps")
      .select("id")
      .eq("credited", true)
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length > 0) return { ok: true, action: "already_swept" };
  }

  // Owner: configured user, else the first admin profile
  let ownerId: string | null = cfg.owner_user_id || null;
  if (!ownerId) {
    const { data: adminProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("is_admin", true)
      .order("created_at", { ascending: true })
      .limit(1);
    ownerId = adminProfile?.[0]?.id || null;
  }
  if (!ownerId) return { ok: false, action: "no_owner", message: "No admin profile found" };

  const window = await nextWindow(admin, cfg.epoch);
  const revenue = await computeWindowRevenue(admin, window);

  const decision = decideSweep(!!cfg.enabled || !!opts.force, revenue.total, cfg.min_mwk || 0);
  if (decision.action === "below_min" && !opts.force) {
    await admin.from("platform_revenue_sweeps").insert({
      window_start: window.startISO,
      window_end: window.endISO,
      battle_fees_mwk: revenue.battleFees,
      withdrawal_fees_mwk: revenue.withdrawalFees,
      membership_fees_mwk: revenue.membershipRevenue,
      total_mwk: revenue.total,
      credited: false,
      payout_status: "skipped_below_min",
      notes: `Below configured minimum (MK${cfg.min_mwk || 0}) — revenue carries to next window`,
    });
    return {
      ok: true, action: "below_min",
      windowStart: window.startISO, windowEnd: window.endISO,
      battleFees: revenue.battleFees, withdrawalFees: revenue.withdrawalFees, membershipRevenue: revenue.membershipRevenue,
      total: revenue.total, credited: false, payoutStatus: "skipped_below_min",
      message: `MK${revenue.total.toLocaleString()} below minimum — carried over`,
    };
  }

  if (opts.dry) {
    return {
      ok: true, action: "sweep",
      windowStart: window.startISO, windowEnd: window.endISO,
      battleFees: revenue.battleFees, withdrawalFees: revenue.withdrawalFees, membershipRevenue: revenue.membershipRevenue,
      total: revenue.total, credited: false, payoutStatus: "dry",
      message: "Dry run — nothing moved",
    };
  }

  // ── 1) Credit the owner's wallet ────────────────────────────────────────
  const { error: creditErr } = await admin.rpc("credit_wallet", {
    p_user_id: ownerId,
    p_amount: revenue.total,
  });
  if (creditErr) {
    await admin.from("platform_revenue_sweeps").insert({
      window_start: window.startISO,
      window_end: window.endISO,
      battle_fees_mwk: revenue.battleFees,
      withdrawal_fees_mwk: revenue.withdrawalFees,
      membership_fees_mwk: revenue.membershipRevenue,
      total_mwk: revenue.total,
      credited: false,
      payout_status: "credit_failed",
      notes: `credit_wallet failed: ${creditErr.message}`,
    });
    return { ok: false, action: "sweep", message: `Credit failed: ${creditErr.message}` };
  }

  // Audit ledger (unique reference — idempotent on retry)
  await admin.from("deposits").insert({
    user_id: ownerId,
    amount: revenue.total,
    status: "success",
    method: "platform_revenue_sweep",
    reference: `revenue_sweep:${window.endISO}`,
  }).then(() => {}, () => {});

  // ── 2) Create the withdrawal to the owner's destination ─────────────────
  const destPhone = String(cfg.dest_phone || "").trim();
  let withdrawalId: string | null = null;
  let payoutStatus = "wallet_only";

  if (destPhone) {
    const operatorRefId = cfg.dest_operator || detectOperator(destPhone);
    const operatorName =
      operatorRefId === TNM_OPERATOR_ID ? "TNM Mpamba" : "Airtel Money";
    const { data: wid, error: wErr } = await admin.rpc("request_withdrawal", {
      p_user_id: ownerId,
      p_amount: revenue.total,
      p_phone: destPhone,
      p_operator_ref_id: operatorRefId,
      p_operator_name: operatorName,
    });
    if (!wErr && wid) {
      withdrawalId = wid as string;
      const provider = cfg.dest_provider === "pawapay" ? "pawapay" : "paychangu";
      const { error: wdMetaErr } = await admin
        .from("withdrawals")
        .update({
          payment_provider: provider,
          country: "MW",
          currency: "MWK",
          fee: 0,
          net_amount: revenue.total,
          admin_notes: "Weekly platform revenue sweep (auto)",
        })
        .eq("id", withdrawalId);
      if (wdMetaErr) console.error("Revenue sweep withdrawal metadata update failed:", wdMetaErr);
      payoutStatus = "pending";
    } else {
      payoutStatus = "withdrawal_failed";
    }
  }

  // ── 3) Auto-execute the payout if configured ────────────────────────────
  if (withdrawalId && cfg.auto_payout && destPhone) {
    const provider = cfg.dest_provider === "pawapay" ? "pawapay" : "paychangu";
    const chargeId = `rev_sweep_${Date.now()}`;
    let payoutSucceeded = false;

    if (provider === "pawapay") {
      try {
        const { initiatePayout } = await import("@/lib/payments/pawapay");
        const { randomUUID } = await import("crypto");
        const payoutId = randomUUID();
        const res = await initiatePayout({
          payoutId,
          amount: String(revenue.total),
          currency: "MWK",
          phoneNumber: destPhone,
          provider: cfg.dest_operator || detectOperator(destPhone),
        });
        if (res.status === "ACCEPTED" || res.status === "COMPLETED") {
          payoutSucceeded = true;
          await admin
            .from("withdrawals")
            .update({
              status: "completed",
              processed_at: new Date().toISOString(),
              charge_id: chargeId,
              pawapay_ref: payoutId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", withdrawalId)
            .then(() => {}, () => {});
        }
      } catch (e) {
        console.error("Revenue sweep pawapay payout error:", e);
      }
    } else {
      try {
        const res = await fetch("https://api.paychangu.com/mobile-money/payouts/initialize", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            mobile: destPhone,
            mobile_money_operator_ref_id: cfg.dest_operator || detectOperator(destPhone),
            amount: String(revenue.total),
            charge_id: chargeId,
          }),
        });
        const data = await res.json();
        if (data.status === "success" || data.status === "pending") {
          payoutSucceeded = true;
          await admin
            .from("withdrawals")
            .update({
              status: "completed",
              processed_at: new Date().toISOString(),
              charge_id: chargeId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", withdrawalId)
            .then(() => {}, () => {});
        }
      } catch (e) {
        console.error("Revenue sweep paychangu payout error:", e);
      }
    }

    payoutStatus = payoutSucceeded ? "paid" : "payout_failed";
    if (!payoutSucceeded) {
      // Payout failed — withdrawal stays approved-pending; re-approve path:
      // admin can retry the payout from the Withdrawals panel.
      await admin
        .from("withdrawals")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .eq("id", withdrawalId)
        .then(() => {}, () => {});
    }
  }

  // ── 4) Record the sweep + notify the owner ─────────────────────────────
  await admin.from("platform_revenue_sweeps").insert({
    window_start: window.startISO,
    window_end: window.endISO,
    battle_fees_mwk: revenue.battleFees,
    withdrawal_fees_mwk: revenue.withdrawalFees,
    total_mwk: revenue.total,
    credited: true,
    withdrawal_id: withdrawalId,
    payout_status: payoutStatus,
  });

  try {
    await admin.from("notifications").insert({
      user_id: ownerId,
      type: "revenue_sweep",
      title: "Weekly revenue sweep",
      body: `MK${revenue.total.toLocaleString()} platform revenue swept (battles MK${revenue.battleFees.toLocaleString()} + withdrawal fees MK${revenue.withdrawalFees.toLocaleString()}).`,
      data: { total: revenue.total, payoutStatus, withdrawalId },
      read: false,
    });
  } catch {}

  return {
    ok: true,
    action: "sweep",
    windowStart: window.startISO,
    windowEnd: window.endISO,
    battleFees: revenue.battleFees,
    withdrawalFees: revenue.withdrawalFees,
    total: revenue.total,
    credited: true,
    payoutStatus,
    withdrawalId: withdrawalId || undefined,
  };
}

export { AIRTEL_OPERATOR_ID, TNM_OPERATOR_ID };
