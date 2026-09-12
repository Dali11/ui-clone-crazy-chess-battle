import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// PayChangu signs webhooks with HMAC-SHA256 of the raw JSON body, using the
// webhook secret from the dashboard. The digest is sent in the "Signature" header.
function isValidSignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  try {
    // Read the raw body first — HMAC must be computed over the exact bytes PayChangu sent.
    const rawBody = await req.text();

    const webhookSecret = process.env.PAYCHANGU_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error("PAYCHANGU_WEBHOOK_SECRET not configured");
      return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
    }

    const signature = req.headers.get("signature") || req.headers.get("Signature");
    if (!isValidSignature(rawBody, signature, webhookSecret)) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
    }

    const body = JSON.parse(rawBody);

    const status = body.status;
    const chargeId = body.charge_id;

    if (!chargeId) {
      return NextResponse.json({ error: "No charge_id" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Fetch the deposit (charge_id for mobile money, tx_ref for card/standard checkout)
    let { data: deposit } = await admin
      .from("deposits")
      .select("id, user_id, amount, status, reference, method")
      .eq("charge_id", chargeId)
      .single();

    if (!deposit) {
      const { data: txDeposit } = await admin
        .from("deposits")
        .select("id, user_id, amount, status, reference, method")
        .eq("tx_ref", chargeId)
        .single();
      deposit = txDeposit;
    }

    if (!deposit) {
      return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
    }

    // Only process if still pending
    if (deposit.status !== "pending") {
      return NextResponse.json({ received: true, message: "Already processed" });
    }

    if (status === "success") {
      // ATOMIC GUARD: atomically claim from "pending" to "processing"
      // Prevents double-credit if webhook + client verify race
      const { data: claimed, error: claimErr } = await admin
        .from("deposits")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", deposit.id)
        .eq("status", "pending")
        .select("id");

      if (claimErr || !claimed || claimed.length === 0) {
        // Another request already claimed this deposit
        return NextResponse.json({ received: true, message: "Already processing" });
      }

      // Membership purchases: extend membership instead of crediting the
      // wallet. (The legacy weekend-league membership payments are
      // retired — this branch is the new membership plan.)
      if (deposit.method === "membership_purchase") {
        const { extendMembership } = await import("@/lib/membership/membership");
        const { data: mp } = await admin
          .from("profiles")
          .select("membership_until")
          .eq("id", deposit.user_id)
          .single();
        const now = new Date().toISOString();
        const until = extendMembership(mp?.membership_until, now, 30);
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

        return NextResponse.json({ received: true, message: "Membership activated" });
      }

      // Normal deposit — credit wallet
      await admin.rpc('credit_wallet', {
        p_user_id: deposit.user_id,
        p_amount: deposit.amount,
      });

      await admin
        .from("deposits")
        .update({ status: "success", updated_at: new Date().toISOString() })
        .eq("id", deposit.id);

    } else if (status === "failed" || status === "cancelled") {
      await admin
        .from("deposits")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", deposit.id);
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error("Webhook error:", e);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
