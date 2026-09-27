import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapPawaPayStatus, type PawaPayCallback } from "@/lib/payments/pawapay";
import { notifyAdminsMoneyEvent } from "@/lib/admin-alerts";

import { processAffiliateCommission } from "@/lib/affiliate/commission";
/**
 * PawaPay callback handler.
 * PawaPay sends POST requests to this endpoint when a deposit or payout
 * reaches its final status (COMPLETED, FAILED, REJECTED).
 *
 * Configure the callback URL in the PawaPay dashboard.
 * The endpoint must return HTTP 200 to acknowledge receipt.
 *
 * Security: PawaPay callbacks are not HMAC-signed like PayChangu.
 * Instead, we verify by checking that the depositId/payoutId exists
 * in our database and is in a "pending" state. This makes replay
 * attacks and fake callbacks ineffective (they can't change a
 * non-pending record due to the atomic status guard).
 */
export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody) as PawaPayCallback;

    const admin = createAdminClient();

    // ── Phase 2 reconciliation source ──────────────────────────────────
    // Record EVERY provider callback (append-only) BEFORE processing, so
    // the reconciliation engine can compare CrazyChess records against
    // the provider's view of the world. Failures here never block payment
    // processing, but are surfaced in the logs.
    if (body.depositId || body.payoutId) {
      try {
        await admin.from("provider_transactions").insert({
          provider: "pawapay",
          provider_ref: body.depositId || body.payoutId!,
          direction: body.depositId ? "deposit" : "payout",
          provider_status: body.status,
          amount_local: body.amount != null ? Number(body.amount) : null,
          currency: body.currency || null,
          country: body.country || null,
          raw_payload: body as unknown as Record<string, unknown>,
        });
      } catch (recErr: any) {
        console.error("provider_transactions record failed:", recErr?.message);
      }
    }

    // ── Handle DEPOSIT callback ─────────────────────────────────────────
    if (body.depositId) {
      const internalStatus = mapPawaPayStatus(body.status);

      // Find the deposit by PawaPay depositId
      const { data: deposit } = await admin
        .from("deposits")
        .select("id, user_id, amount, amount_local, currency, status, reference, method")
        .eq("pawapay_ref", body.depositId)
        .single();

      if (!deposit) {
        // Could be a deposit we don't track — acknowledge to stop retries
        return NextResponse.json({ received: true, message: "Deposit not found" });
      }

      // Only process if still pending
      if (deposit.status !== "pending") {
        return NextResponse.json({ received: true, message: "Already processed" });
      }

      if (internalStatus === "success") {
        // ATOMIC GUARD: claim from "pending" to "processing"
        const { data: claimed } = await admin
          .from("deposits")
          .update({ status: "processing", updated_at: new Date().toISOString() })
          .eq("id", deposit.id)
          .eq("status", "pending")
          .select("id");

        if (!claimed || claimed.length === 0) {
          return NextResponse.json({ received: true, message: "Already processing" });
        }

        // Membership purchases don't credit the wallet — they extend
        // membership. (Cash is platform revenue, swept weekly to the owner.)
        if (deposit.method === "membership_purchase") {
          const { extendMembership } = await import("@/lib/membership/membership");
          const { data: mp } = await admin
            .from("profiles")
            .select("membership_until")
            .eq("id", deposit.user_id)
            .single();
          const now = new Date().toISOString();
          const { getPlatformConfig } = await import("@/lib/platform-config");
          const memCfg = await getPlatformConfig(admin, "membership");
          const periodDays = Number(memCfg.period_days) || 30;
          const until = extendMembership(mp?.membership_until, now, periodDays);
          await admin.from("profiles").update({ membership_until: until }).eq("id", deposit.user_id);

          await admin
            .from("deposits")
            .update({ status: "success", updated_at: now })
            .eq("id", deposit.id);

          try {
            await admin.from("notifications").insert({
              user_id: deposit.user_id,
              type: "membership_active",
              title: "Membership active 🎉",
              body: `You're a member until ${until.slice(0, 10)} — ads are off. Thanks for supporting Crazy Chess Battles!`,
              data: { until, amount: deposit.amount },
              read: false,
            });
          } catch {}

          // Admin alert (email + push) — membership revenue in
          try {
            const { data: memProfile } = await admin
              .from("profiles")
              .select("username, display_name")
              .eq("id", deposit.user_id)
              .single();
            await notifyAdminsMoneyEvent(admin, {
              kind: "deposit_success",
              playerName: memProfile?.display_name || memProfile?.username || "Unknown player",
              amount: deposit.amount,
              amountLocal: deposit.amount_local,
              currency: deposit.currency,
              method: "membership_purchase",
              reference: deposit.reference,
              txId: deposit.id,
            });
          } catch {}

          // Affiliate commission (same as the PayChangu rails): pays the
          // referrer 25%, properly ledgered. Never blocks activation.
          try {
            const affCfg = await getPlatformConfig(admin, "affiliate");
            if (affCfg.enabled) {
              await processAffiliateCommission(admin, deposit.user_id, deposit.amount);
            }
          } catch (affErr) {
            console.error("affiliate commission failed:", affErr);
          }

          return NextResponse.json({ received: true });
        }

        // Normal deposit — credit wallet
        await admin.rpc("credit_wallet", {
          p_user_id: deposit.user_id,
          p_amount: deposit.amount,
        });

        await admin
          .from("deposits")
          .update({ status: "success", updated_at: new Date().toISOString() })
          .eq("id", deposit.id);

        // Notify user
        try {
          await admin.from("notifications").insert({
            user_id: deposit.user_id,
            type: "deposit_success",
            title: "Deposit confirmed",
            body: `Your deposit of ${(deposit.amount_local ?? deposit.amount).toLocaleString()}${deposit.currency && deposit.currency !== "MWK" ? ` ${deposit.currency}` : ""} has been credited to your wallet.`,
            data: { amount: deposit.amount, method: "pawapay" },
            read: false,
          });
        } catch {}

        // Admin alert (email + push) — money in
        try {
          const { data: depProfile } = await admin
            .from("profiles")
            .select("username, display_name")
            .eq("id", deposit.user_id)
            .single();
          await notifyAdminsMoneyEvent(admin, {
            kind: "deposit_success",
            playerName: depProfile?.display_name || depProfile?.username || "Unknown player",
            amount: deposit.amount,
            amountLocal: deposit.amount_local,
            currency: deposit.currency,
            method: "pawapay",
            reference: deposit.reference,
            txId: deposit.id,
          });
        } catch {}

      } else if (internalStatus === "failed") {
        // Keep the provider's failure reason (INSUFFICIENT_BALANCE,
        // PAYMENT_NOT_APPROVED, …) so support and the player-facing verify
        // endpoint can explain the failure instead of a bare "failed".
        await admin
          .from("deposits")
          .update({
            status: "failed",
            updated_at: new Date().toISOString(),
            admin_notes: `PawaPay failure: ${JSON.stringify(body.failureReason || { failureCode: body.status })}`,
          })
          .eq("id", deposit.id);
      }

      return NextResponse.json({ received: true });
    }

    // ── Handle PAYOUT callback ───────────────────────────────────────────
    if (body.payoutId) {
      const internalStatus = mapPawaPayStatus(body.status);

      // Find the withdrawal by PawaPay payoutId
      const { data: withdrawal } = await admin
        .from("withdrawals")
        .select("id, user_id, amount, fee, net_amount, currency, country, status")
        .eq("pawapay_ref", body.payoutId)
        .single();

      if (!withdrawal) {
        return NextResponse.json({ received: true, message: "Withdrawal not found" });
      }

      // 'rejected' is terminal (already refunded) — duplicate callbacks
      // are no-ops.
      if (withdrawal.status === "rejected") {
        return NextResponse.json({ received: true, message: "Already processed" });
      }

      if (internalStatus === "success") {
        // Mark withdrawal as completed (idempotent — may already be marked)
        await admin
          .from("withdrawals")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", withdrawal.id);

        try {
          if (withdrawal.status !== "completed") {
            await admin.from("notifications").insert({
              user_id: withdrawal.user_id,
              type: "withdrawal_approved",
              title: "Withdrawal completed",
              body: `Your withdrawal of ${withdrawal.amount.toLocaleString()} has been sent to your mobile money wallet.`,
              data: { amount: withdrawal.amount, method: "pawapay" },
              read: false,
            });

            // Admin alert (email + push) — money out, fired once per
            // transition to terminal COMPLETED
            const { data: wProfile } = await admin
              .from("profiles")
              .select("username, display_name")
              .eq("id", withdrawal.user_id)
              .single();
            await notifyAdminsMoneyEvent(admin, {
              kind: "withdrawal_success",
              playerName: wProfile?.display_name || wProfile?.username || "Unknown player",
              amount: withdrawal.amount,
              amountLocal: withdrawal.net_amount ?? withdrawal.amount,
              currency: withdrawal.currency,
              method: "pawapay",
              country: withdrawal.country,
              txId: withdrawal.id,
            });
          }
        } catch {}

      } else if (internalStatus === "failed") {
        // Payout failed at the provider — refund the wallet. The
        // withdrawal may be 'pending', but it may also be 'completed':
        // that is only the optimistic marker set when the payout was
        // INITIATED (PawaPay ACCEPTED). A terminal FAILED callback must
        // refund from either state. refund_failed_payout is idempotent
        // and writes the ledger row atomically.
        const { error: refundErr } = await admin.rpc("refund_failed_payout", {
          p_withdrawal_id: withdrawal.id,
          p_reason: `PawaPay payout ${body.status}`,
        });
        if (refundErr) {
          console.error(`MANUAL INTERVENTION: payout failure refund failed for withdrawal ${withdrawal.id}:`, refundErr.message);
        }

        try {
          await admin.from("notifications").insert({
            user_id: withdrawal.user_id,
            type: "withdrawal_failed",
            title: "Withdrawal payout failed",
            body: `Your withdrawal for ${withdrawal.amount.toLocaleString()} could not be processed. Funds returned to your wallet.`,
            data: { amount: withdrawal.amount, method: "pawapay" },
            read: false,
          });
        } catch {}
      }

      return NextResponse.json({ received: true });
    }

    return NextResponse.json({ received: true, message: "No depositId or payoutId" });
  } catch (e: any) {
    console.error("PawaPay webhook error:", e);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
