import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";
import { isAllowedDepositPhone } from "@/lib/deposit-phones";
import { toMalawiLocalMsisdn } from "@/lib/payments/malawi-phone";
import { moneySymbol } from "@/lib/geo/format";
import { formatMoneyConverted } from "@/lib/geo/server-format";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { amount, phone, operatorRefId, email, firstName, lastName } = await req.json();

    // ─── Load platform config ──────────────────────────────────────────
    const admin = createAdminClient();
    const dConfig = await getPlatformConfig(admin, "deposits");

    // Get user's currency symbol + saved deposit phone numbers
    const { data: _profile } = await admin.from("profiles").select("country, deposit_phone_numbers").eq("id", user.id).single();
    const sym = moneySymbol(_profile?.country);

    // Check if deposits are enabled
    if (!dConfig.enabled) {
      return NextResponse.json({ error: "Deposits are currently disabled" }, { status: 403 });
    }

    // Enforce minimum amount
    const minAmount = dConfig.min_amount || 1000;
    if (!amount || amount < minAmount) {
      const minDisplay = minAmount.toLocaleString();
      return NextResponse.json({ error: `Minimum deposit is ${await formatMoneyConverted(minAmount, _profile?.country)}` }, { status: 400 });
    }

    // Enforce maximum amount
    const maxAmount = dConfig.max_amount || 10_000_000;
    if (amount > maxAmount) {
      const maxDisplay = maxAmount.toLocaleString();
      return NextResponse.json({ error: `Maximum deposit is ${await formatMoneyConverted(maxAmount, _profile?.country)}` }, { status: 400 });
    }

    if (!phone || !operatorRefId) {
      return NextResponse.json({ error: "Phone number and operator required" }, { status: 400 });
    }

    // Canonicalize to the local MSISDN format PayChangu requires
    // ("09XXXXXXXX"). Players save numbers as "+265 991 23 45 67" etc.;
    // the raw form is rejected by PayChangu's API — the same live
    // incident the withdrawals route fixed 2026-09-17/18 (deposits from
    // international-format numbers failed 11/11 in the 2 weeks to
    // 2026-09-21).
    const canonicalPhone = toMalawiLocalMsisdn(phone);
    if (!canonicalPhone) {
      return NextResponse.json({ error: "Invalid Malawi mobile money number — use a 09… or 08… number." }, { status: 400 });
    }

    // Deposits can only go through a number the player already saved and
    // saved in Settings (anti OTP-spam) — never an arbitrary free-text number.
    const savedDepositPhones = (_profile?.deposit_phone_numbers as string[] | null) || [];
    if (savedDepositPhones.length === 0) {
      return NextResponse.json({ error: "Add a deposit phone number in Settings before depositing." }, { status: 400 });
    }
    if (!isAllowedDepositPhone(savedDepositPhones, phone)) {
      return NextResponse.json({ error: "You can only deposit using one of your saved phone numbers. Manage them in Settings." }, { status: 400 });
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
        phone: canonicalPhone,
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
        mobile: canonicalPhone,
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
      // Keep the REAL provider error for support/reconciliation — the
      // deposits ledger previously lost it entirely (0 paychangu rows in
      // provider_transactions before this fix).
      const reasonPayload = {
        failureCode: data?.code || data?.error || null,
        failureMessage: (data?.message || data?.error || (typeof data.error === "object" ? JSON.stringify(data.error) : null)) || null,
        httpStatus: res.status,
      };
      await admin.from("deposits")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
          admin_notes: `PayChangu initiation rejected: ${JSON.stringify(reasonPayload)}`,
        })
        .eq("id", deposit.id);
      try {
        await admin.from("provider_transactions").insert({
          provider: "paychangu",
          provider_ref: data?.reference || data?.tx_ref || chargeId,
          direction: "deposit",
          provider_status: "failed",
          raw_payload: reasonPayload,
        });
      } catch {}

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
