import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPayoutStatus, mapPawaPayStatus } from "@/lib/payments/pawapay";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Payout reconciliation sweep.
 *
 * PawaPay callbacks (webhooks) are not configured for this account, so
 * the only signal we normally get is the initiation response (ACCEPTED
 * → withdrawal optimistically marked "completed"). If a payout later
 * FAILS at the provider, nobody would ever know — the player's money
 * would be gone with no wallet refund.
 *
 * This sweep closes the gap by polling PawaPay directly for every
 * non-terminal-but-paid-out withdrawal:
 *   - payout COMPLETED at provider → confirm our "completed" (record
 *     the terminal status in provider_transactions)
 *   - payout FAILED at provider    → refund_failed_payout (wallet
 *     refund + status rejected, idempotent) + notify the player
 *   - still in flight              → record first sighting only
 *
 * Schedule: every 15 minutes via Vercel Cron (vercel.json).
 * Also callable manually by an admin (no CRON_SECRET needed then) —
 * the admin withdrawals panel fires it on load for near-realtime state.
 *
 * Authorization: CRON_SECRET bearer header (Vercel Cron) OR an
 * authenticated admin user (manual/admin-panel trigger).
 */
export async function GET(req: NextRequest) {
  const admin = createAdminClient();

  // ── Auth: cron secret OR admin user ──────────────────────────────
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  let isAdmin = false;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Vercel Cron — allowed
  } else {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
      isAdmin = !!profile?.is_admin;
    }
    if (!isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // ── Candidates: pawapay payouts that were accepted/optimistically
  //    completed more than 10 minutes ago and never got a terminal
  //    provider confirmation ────────────────────────────────────────
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: candidates, error } = await admin
    .from("withdrawals")
    .select("id, user_id, amount, fee, net_amount, currency, country, phone, status, pawapay_ref, payment_provider, created_at, processed_at")
    .eq("payment_provider", "pawapay")
    .not("pawapay_ref", "is", null)
    .in("status", ["approved", "completed"])
    .lt("processed_at", tenMinAgo)
    .order("created_at", { ascending: true })
    .limit(25);

  // Withdrawals whose payout already has a TERMINAL provider record are
  // settled — re-polling them every sweep would burn PawaPay API calls
  // on history forever. Filter them out up front.
  let openCandidates = candidates || [];
  if (openCandidates.length > 0) {
    const refs = openCandidates.map((w) => w.pawapay_ref!) as string[];
    const { data: terminalRefs } = await admin
      .from("provider_transactions")
      .select("provider_ref")
      .in("provider_ref", refs)
      .in("provider_status", ["COMPLETED", "FAILED", "REJECTED"]);
    const settled = new Set((terminalRefs || []).map((r) => r.provider_ref));
    openCandidates = openCandidates.filter((w) => !settled.has(w.pawapay_ref!));
  }

  if (error) {
    console.error("reconcile-payouts: fetch candidates failed:", error.message);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  const result = { checked: 0, confirmed: 0, refunded: 0, stillPending: 0, errors: 0 };

  for (const w of openCandidates) {
    try {
      const payout = await checkPayoutStatus(w.pawapay_ref!);
      const internalStatus = mapPawaPayStatus(payout.status);
      result.checked++;

      const recordStatus = async () => {
        try {
          await admin.from("provider_transactions").insert({
            provider: "pawapay",
            provider_ref: w.pawapay_ref!,
            direction: "payout",
            provider_status: payout.status,
            amount_local: payout.amount != null ? Number(payout.amount) : null,
            currency: payout.currency || w.currency || null,
            country: payout.country || w.country || null,
            raw_payload: payout as unknown as Record<string, unknown>,
          });
        } catch {}
      };

      if (internalStatus === "success") {
        await recordStatus();
        if (w.status !== "completed") {
          await admin
            .from("withdrawals")
            .update({ status: "completed", processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
            .eq("id", w.id);
          try {
            await admin.from("notifications").insert({
              user_id: w.user_id,
              type: "withdrawal_approved",
              title: "Withdrawal completed",
              body: `Your withdrawal of ${w.amount.toLocaleString()} has been sent to your mobile money wallet.`,
              data: { amount: w.amount, method: "pawapay" },
              read: false,
            });
          } catch {}
        }
        result.confirmed++;
      } else if (internalStatus === "failed") {
        await recordStatus();
        if (w.status !== "rejected") {
          const fr = (payout as any).failureReason;
          const { error: refundErr } = await admin.rpc("refund_failed_payout", {
            p_withdrawal_id: w.id,
            p_reason: `PawaPay payout ${payout.status}${fr ? `: ${fr.failureCode} (${fr.failureMessage})` : ""} (reconciliation sweep)`,
          });
          if (refundErr) {
            console.error(`MANUAL INTERVENTION: sweep refund failed for withdrawal ${w.id}:`, refundErr.message);
            result.errors++;
            continue;
          }
          try {
            await admin.from("notifications").insert({
              user_id: w.user_id,
              type: "withdrawal_failed",
              title: "Withdrawal payout failed",
              body: `Your withdrawal for ${w.amount.toLocaleString()} could not be processed. Funds returned to your wallet.`,
              data: { amount: w.amount, method: "pawapay" },
              read: false,
            });
          } catch {}
        }
        result.refunded++;
      } else {
        // Still in flight — record the first sighting for visibility only
        const { data: anyPrior } = await admin
          .from("provider_transactions")
          .select("id")
          .eq("provider_ref", w.pawapay_ref!)
          .limit(1);
        if (!anyPrior || anyPrior.length === 0) {
          await recordStatus();
        }
        result.stillPending++;
      }
    } catch (e: any) {
      console.error(`reconcile-payouts: withdrawal ${w.id} (payout ${w.pawapay_ref}) failed:`, e?.message);
      result.errors++;
    }
  }

  return NextResponse.json({ ok: true, ...result, candidates: openCandidates.length });
}
