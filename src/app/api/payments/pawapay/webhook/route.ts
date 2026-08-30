import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapPawaPayStatus, type PawaPayCallback } from "@/lib/payments/pawapay";

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

    // ── Handle DEPOSIT callback ─────────────────────────────────────────
    if (body.depositId) {
      const internalStatus = mapPawaPayStatus(body.status);

      // Find the deposit by PawaPay depositId
      const { data: deposit } = await admin
        .from("deposits")
        .select("id, user_id, amount, status, reference")
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

        // Check if this is a membership payment
        const isMembership = deposit.reference?.startsWith("membership:");

        if (isMembership) {
          await admin
            .from("deposits")
            .update({ status: "success", updated_at: new Date().toISOString() })
            .eq("id", deposit.id);

          // activateMembership is imported lazily to avoid circular deps
          const { activateMembership } = await import("@/lib/league/membership");
          try {
            await activateMembership(admin, deposit.user_id, (deposit as any).pawapay_ref || (deposit as any).charge_id || body.depositId, deposit.reference);
          } catch (err) {
            console.error("PawaPay webhook membership activation failed:", err);
          }
          return NextResponse.json({ received: true, message: "Membership activated" });
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
            body: `Your deposit of ${deposit.amount.toLocaleString()} has been credited to your wallet.`,
            data: { amount: deposit.amount, method: "pawapay" },
            read: false,
          });
        } catch {}

      } else if (internalStatus === "failed") {
        await admin
          .from("deposits")
          .update({ status: "failed", updated_at: new Date().toISOString() })
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
        .select("id, user_id, amount, status")
        .eq("pawapay_ref", body.payoutId)
        .single();

      if (!withdrawal) {
        return NextResponse.json({ received: true, message: "Withdrawal not found" });
      }

      if (withdrawal.status === "completed" || withdrawal.status === "rejected") {
        return NextResponse.json({ received: true, message: "Already processed" });
      }

      if (internalStatus === "success") {
        // Mark withdrawal as completed
        await admin
          .from("withdrawals")
          .update({ status: "completed", updated_at: new Date().toISOString() })
          .eq("id", withdrawal.id);

        try {
          await admin.from("notifications").insert({
            user_id: withdrawal.user_id,
            type: "withdrawal_approved",
            title: "Withdrawal completed",
            body: `Your withdrawal of ${withdrawal.amount.toLocaleString()} has been sent to your mobile money wallet.`,
            data: { amount: withdrawal.amount, method: "pawapay" },
            read: false,
          });
        } catch {}

      } else if (internalStatus === "failed") {
        // Payout failed — refund the wallet
        await admin.rpc("refund_withdrawal", {
          p_withdrawal_id: withdrawal.id,
          p_admin_id: null,
        });

        await admin
          .from("withdrawals")
          .update({ status: "rejected", updated_at: new Date().toISOString() })
          .eq("id", withdrawal.id);

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
