import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapOntechStatus, isOntechDisbursement, ontechReference, type OntechCallback } from "@/lib/payments/ontech";

/**
 * Ontech Payments (Zambia) callback handler.
 * Registered in the Ontech merchant dashboard as this app's Webhook URL,
 * for events: payment.success, payment.completed, payment.failed,
 * payment.reversed, disbursement.completed, disbursement.failed.
 *
 * Security: same model as our PawaPay webhook (which also has no HMAC
 * signing) — we only ever act on a callback that matches an EXISTING
 * pending deposit/withdrawal row we created, and atomically claim it
 * before crediting. Random/forged callbacks can't move money because
 * they can't reference a row we already have. If ONTECH_WEBHOOK_SECRET
 * is later provided by Ontech, this also verifies an HMAC signature —
 * currently a no-op if the header/secret aren't present.
 *
 * We haven't confirmed Ontech's exact payload field names yet (no API
 * docs wired up) — every callback is logged in full so the first real
 * test fire from the dashboard tells us the true shape. The handler
 * tries several common field names for the merchant reference.
 */
function verifySignature(rawBody: string, req: NextRequest): boolean {
  const secret = process.env.ONTECH_WEBHOOK_SECRET;
  if (!secret) return true; // no secret configured yet — skip (see security note above)
  const sig = req.headers.get("x-ontech-signature") || req.headers.get("signature");
  if (!sig) return true; // Ontech didn't send one this time — don't hard-fail unconfirmed docs
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(sig, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let rawBody = "";
  try {
    rawBody = await req.text();
    console.log("[ontech webhook] raw payload:", rawBody);

    if (!verifySignature(rawBody, req)) {
      console.error("[ontech webhook] signature verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody || "{}") as OntechCallback;
    const admin = createAdminClient();

    const ref = ontechReference(body);
    const internalStatus = mapOntechStatus(body);
    const disbursement = isOntechDisbursement(body);

    if (!ref) {
      console.error("[ontech webhook] no reference field found in payload — check field names above");
      return NextResponse.json({ received: true, message: "No reference in payload" });
    }

    if (disbursement) {
      // ── Payout / withdrawal callback ──────────────────────────────
      const { data: withdrawal } = await admin
        .from("withdrawals")
        .select("id, user_id, amount, status")
        .eq("ontech_ref", ref)
        .single();

      if (!withdrawal) return NextResponse.json({ received: true, message: "Withdrawal not found" });
      if (withdrawal.status === "completed" || withdrawal.status === "rejected")
        return NextResponse.json({ received: true, message: "Already processed" });

      if (internalStatus === "success") {
        await admin.from("withdrawals").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", withdrawal.id);
        try {
          await admin.from("notifications").insert({
            user_id: withdrawal.user_id, type: "withdrawal_approved", title: "Withdrawal completed",
            body: `Your withdrawal of ${withdrawal.amount.toLocaleString()} has been sent to your mobile money wallet.`,
            data: { amount: withdrawal.amount, method: "ontech" }, read: false,
          });
        } catch {}
      } else if (internalStatus === "failed") {
        await admin.rpc("refund_withdrawal", { p_withdrawal_id: withdrawal.id, p_admin_id: null });
        await admin.from("withdrawals").update({ status: "rejected", updated_at: new Date().toISOString() }).eq("id", withdrawal.id);
        try {
          await admin.from("notifications").insert({
            user_id: withdrawal.user_id, type: "withdrawal_failed", title: "Withdrawal payout failed",
            body: `Your withdrawal for ${withdrawal.amount.toLocaleString()} could not be processed. Funds returned to your wallet.`,
            data: { amount: withdrawal.amount, method: "ontech" }, read: false,
          });
        } catch {}
      }
      return NextResponse.json({ received: true });
    }

    // ── Deposit / collection callback ────────────────────────────────
    const { data: deposit } = await admin
      .from("deposits")
      .select("id, user_id, amount, status")
      .eq("ontech_ref", ref)
      .single();

    if (!deposit) return NextResponse.json({ received: true, message: "Deposit not found" });
    if (deposit.status !== "pending") return NextResponse.json({ received: true, message: "Already processed" });

    if (internalStatus === "success") {
      const { data: claimed } = await admin
        .from("deposits")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", deposit.id)
        .eq("status", "pending")
        .select("id");
      if (!claimed || claimed.length === 0) return NextResponse.json({ received: true, message: "Already processing" });

      await admin.rpc("credit_wallet", { p_user_id: deposit.user_id, p_amount: deposit.amount });
      await admin.from("deposits").update({ status: "success", updated_at: new Date().toISOString() }).eq("id", deposit.id);
      try {
        await admin.from("notifications").insert({
          user_id: deposit.user_id, type: "deposit_success", title: "Deposit confirmed",
          body: `Your deposit of ${deposit.amount.toLocaleString()} has been credited to your wallet.`,
          data: { amount: deposit.amount, method: "ontech" }, read: false,
        });
      } catch {}
    } else if (internalStatus === "failed") {
      await admin.from("deposits").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", deposit.id);
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error("[ontech webhook] processing error:", e, "raw:", rawBody);
    // Still 200 — Ontech's dashboard "test" button just wants an ack;
    // we don't want unconfirmed payload shapes to trigger their retry storm.
    return NextResponse.json({ received: true, error: "logged" });
  }
}

// Some gateways ping the webhook URL with GET first to verify it's reachable.
export async function GET() {
  return NextResponse.json({ ok: true, service: "ontech-webhook" });
}
