import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";
import { initiateDeposit } from "@/lib/payments/pawapay";
import { isAllowedDepositPhone } from "@/lib/deposit-phones";
import { randomUUID } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { amount, phoneNumber, provider, currency, country } = await req.json();

    // ─── Load platform config ──────────────────────────────────────────
    const admin = createAdminClient();
    const dConfig = await getPlatformConfig(admin, "deposits");

    if (!dConfig.enabled) {
      return NextResponse.json({ error: "Deposits are currently disabled" }, { status: 403 });
    }

    const minAmount = dConfig.min_amount || 1000;
    if (!amount || amount < minAmount) {
      return NextResponse.json(
        { error: `Minimum deposit is ${minAmount.toLocaleString()}` },
        { status: 400 }
      );
    }

    const maxAmount = dConfig.max_amount || 10_000_000;
    if (amount > maxAmount) {
      return NextResponse.json(
        { error: `Maximum deposit is ${maxAmount.toLocaleString()}` },
        { status: 400 }
      );
    }

    if (!phoneNumber || !provider) {
      return NextResponse.json({ error: "Phone number and provider required" }, { status: 400 });
    }

    // Deposits can only go through a number the player already saved and
    // locked in Settings (anti OTP-spam) — never an arbitrary free-text number.
    const { data: depProfile } = await admin.from("profiles").select("deposit_phone_numbers").eq("id", user.id).single();
    const savedDepositPhones = (depProfile?.deposit_phone_numbers as string[] | null) || [];
    if (savedDepositPhones.length === 0) {
      return NextResponse.json({ error: "Add a deposit phone number in Settings before depositing." }, { status: 400 });
    }
    if (!isAllowedDepositPhone(savedDepositPhones, phoneNumber)) {
      return NextResponse.json({ error: "You can only deposit using one of your saved phone numbers. Manage them in Settings." }, { status: 400 });
    }

    // Generate a unique depositId for PawaPay
    const depositId = randomUUID();
    const chargeId = `pwp_${depositId.slice(0, 13)}`;

    // Determine if this deposit needs manual approval
    const approvalThreshold = dConfig.require_approval_above || 0;
    const requiresApproval = approvalThreshold > 0 && amount > approvalThreshold;

    // Create deposit record
    const { data: deposit, error: depositError } = await admin
      .from("deposits")
      .insert({
        user_id: user.id,
        amount: amount,
        method: "pawapay",
        payment_provider: "pawapay",
        status: "pending",
        charge_id: chargeId,
        phone: phoneNumber,
        operator: provider,
        pawapay_ref: depositId,
        country: country || null,
      })
      .select("id")
      .single();

    if (depositError || !deposit) {
      return NextResponse.json({ error: "Failed to create deposit record" }, { status: 500 });
    }

    // Initiate deposit with PawaPay
    try {
      const response = await initiateDeposit({
        depositId,
        amount: String(amount),
        currency: currency || "MWK",
        phoneNumber,
        provider,
      });

      if (response.status === "ACCEPTED" || response.status === "COMPLETED") {
        return NextResponse.json({
          depositId: deposit.id,
          pawapayDepositId: depositId,
          chargeId,
          status: "pending",
          message: "Check your phone to authorize the payment",
          requiresApproval,
        });
      } else {
        // Update deposit status to failed
        await admin.from("deposits")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", deposit.id);

        return NextResponse.json(
          { error: "Payment was not accepted. Please try again." },
          { status: 400 }
        );
      }
    } catch (e: any) {
      // Deposit initiation failed — mark as failed
      await admin.from("deposits")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", deposit.id);

      return NextResponse.json(
        { error: e.message || "Failed to initiate payment. Please try again." },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ error: "Server error. Please try again." }, { status: 500 });
  }
}
