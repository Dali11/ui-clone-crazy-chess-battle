import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";
import { moneySymbol } from "@/lib/geo/format";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { amount, phone, operatorRefId, email, firstName, lastName } = await req.json();

    // ─── Load platform config ──────────────────────────────────────────
    const admin = createAdminClient();
    const dConfig = await getPlatformConfig(admin, "deposits");

    // Get user's currency symbol
    const { data: _profile } = await admin.from("profiles").select("country").eq("id", user.id).single();
    const sym = moneySymbol(_profile?.country);

    // Check if deposits are enabled
    if (!dConfig.enabled) {
      return NextResponse.json({ error: "Deposits are currently disabled" }, { status: 403 });
    }

    // Enforce minimum amount
    const minAmount = dConfig.min_amount || 1000;
    if (!amount || amount < minAmount) {
      const minDisplay = minAmount.toLocaleString();
      return NextResponse.json({ error: `Minimum deposit is ${sym} ${minDisplay}` }, { status: 400 });
    }

    // Enforce maximum amount
    const maxAmount = dConfig.max_amount || 10_000_000;
    if (amount > maxAmount) {
      const maxDisplay = maxAmount.toLocaleString();
      return NextResponse.json({ error: `Maximum deposit is ${sym} ${maxDisplay}` }, { status: 400 });
    }

    if (!phone || !operatorRefId) {
      return NextResponse.json({ error: "Phone number and operator required" }, { status: 400 });
    }

    const chargeId = `ccb_${Date.now()}_${user.id.slice(0, 8)}`;

    // Determine if this deposit needs manual approval
    const approvalThreshold = dConfig.require_approval_above || 0;
    const requiresApproval = approvalThreshold > 0 && amount > approvalThreshold;

    const { data: deposit, error: depositError } = await admin
      .from("deposits")
      .insert({
        user_id: user.id,
        amount: amount,
        method: "mobile_money",
        status: "pending",
        charge_id: chargeId,
        phone,
        operator: operatorRefId,
      })
      .select("id")
      .single();

    if (depositError || !deposit) {
      return NextResponse.json({ error: "Failed to create deposit record" }, { status: 500 });
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
        email: email || undefined,
        first_name: firstName || undefined,
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
      status: data.status || "pending",
      message: data.message || "Check your phone to authorize the payment",
      requiresApproval,
    });
  } catch {
    return NextResponse.json({ error: "Server error. Please try again." }, { status: 500 });
  }
}
