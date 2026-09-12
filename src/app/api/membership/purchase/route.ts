import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";

/**
 * POST /api/membership/purchase  { phone, operatorRefId, email?, firstName?, lastName? }
 *
 * Buys/extends membership via the SAME PayChangu mobile-money rails as
 * deposits: creates a deposits row with method='membership_purchase',
 * then initializes the charge. On payment success the verify/webhook
 * handlers extend profiles.membership_until (NOT the wallet — the cash
 * is platform revenue, swept weekly to the owner).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { phone, operatorRefId, email, firstName, lastName } = await req.json();
    if (!phone || !operatorRefId) {
      return NextResponse.json({ error: "Phone number and operator required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // MW-only for now: the purchase rides PayChangu (Malawi mobile money)
    const { data: profile } = await admin
      .from("profiles")
      .select("country, email, username")
      .eq("id", user.id)
      .single();
    if (profile?.country !== "MW") {
      return NextResponse.json({ error: "Membership is coming soon to your country." }, { status: 403 });
    }

    const cfg = await getPlatformConfig(admin, "membership");
    if (!cfg.enabled) {
      return NextResponse.json({ error: "Membership purchases are currently disabled" }, { status: 403 });
    }

    const amount = Math.round(Number(cfg.price_mwk) || 10000);
    if (amount < 100) return NextResponse.json({ error: "Invalid membership price configured" }, { status: 500 });

    const chargeId = `ccb_mem_${Date.now()}_${user.id.slice(0, 8)}`;

    const { data: deposit, error: depositError } = await admin
      .from("deposits")
      .insert({
        user_id: user.id,
        amount,
        method: "membership_purchase",
        status: "pending",
        charge_id: chargeId,
        phone,
        operator: operatorRefId,
      })
      .select("id")
      .single();

    if (depositError || !deposit) {
      return NextResponse.json({ error: "Failed to create purchase record" }, { status: 500 });
    }

    const res = await fetch("https://api.paychangu.com/mobile-money/payments/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mobile: phone,
        mobile_money_operator_ref_id: operatorRefId,
        amount,
        charge_id: chargeId,
        email: email || profile?.email || undefined,
        first_name: firstName || profile?.username || undefined,
        last_name: lastName || undefined,
      }),
    });

    const data = await res.json();

    if (!res.ok || data.error || data.status === "failed") {
      await admin.from("deposits")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", deposit.id);
      const safeError = data.status === "failed"
        ? "Payment request failed. Please check your phone number and try again."
        : "Unable to initiate payment. Please try again later.";
      return NextResponse.json({ error: safeError }, { status: 400 });
    }

    if (data.reference || data.tx_ref) {
      await admin.from("deposits")
        .update({ paychangu_ref: data.reference || data.tx_ref })
        .eq("id", deposit.id);
    }

    return NextResponse.json({
      depositId: deposit.id,
      chargeId,
      amount,
      status: data.status || "pending",
      message: data.message || "Check your phone to authorize the payment",
    });
  } catch {
    return NextResponse.json({ error: "Server error. Please try again." }, { status: 500 });
  }
}
