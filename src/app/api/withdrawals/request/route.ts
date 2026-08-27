import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { amount, phone, operatorRefId, operatorName } = await req.json();

    // ─── Load platform config ──────────────────────────────────────────
    const admin = createAdminClient();
    const wConfig = await getPlatformConfig(admin, "withdrawals");

    // Check if withdrawals are enabled
    if (!wConfig.enabled) {
      return NextResponse.json({ error: "Withdrawals are currently disabled" }, { status: 403 });
    }

    // Enforce minimum amount
    const minAmount = wConfig.min_amount || 10_000;
    if (!amount || amount < minAmount) {
      const minDisplay = minAmount.toLocaleString();
      return NextResponse.json({ error: `Minimum withdrawal is MWK ${minDisplay}` }, { status: 400 });
    }

    // Enforce maximum amount
    const maxAmount = wConfig.max_amount || 500_000;
    if (amount > maxAmount) {
      const maxDisplay = maxAmount.toLocaleString();
      return NextResponse.json({ error: `Maximum withdrawal is MWK ${maxDisplay}` }, { status: 400 });
    }

    // Enforce daily limit
    const dailyLimit = wConfig.daily_limit || 0;
    if (dailyLimit > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: todayWithdrawals } = await admin
        .from("withdrawals")
        .select("amount")
        .eq("user_id", user.id)
        .gte("created_at", today.toISOString())
        .in("status", ["pending", "approved", "completed"]);

      const todayTotal = (todayWithdrawals || []).reduce((sum, w) => sum + w.amount, 0);
      if (todayTotal + amount > dailyLimit) {
        const remaining = Math.max(0, dailyLimit - todayTotal).toLocaleString();
        return NextResponse.json({ error: `Daily withdrawal limit reached. Remaining: MWK ${remaining}` }, { status: 400 });
      }
    }

    // Validate phone format (Malawi: 08x, 09x, +265, 265)
    if (!phone || !operatorRefId || !operatorName) {
      return NextResponse.json({ error: "Phone, operator required" }, { status: 400 });
    }
    const phoneDigits = phone.replace(/\D/g, "");
    const localPhone = phoneDigits.startsWith("265") ? "0" + phoneDigits.slice(3) : phoneDigits;
    if (localPhone.length < 9 || !localPhone.match(/^0[89]/)) {
      return NextResponse.json({ error: "Invalid Malawi mobile money number" }, { status: 400 });
    }

    // Check for existing pending withdrawal (prevent spam)
    const { data: existingPending } = await admin
      .from("withdrawals")
      .select("id, amount")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .limit(1);

    if (existingPending && existingPending.length > 0) {
      return NextResponse.json({ error: "You already have a pending withdrawal. Wait for it to be processed before requesting another." }, { status: 400 });
    }

    // Apply withdrawal fee + processing fee
    const withdrawalFee = wConfig.withdrawal_fee || 0;
    const processingFeePct = wConfig.processing_fee_pct || 0;
    const processingFee = Math.floor(amount * (processingFeePct / 100));
    const totalFees = withdrawalFee + processingFee;
    const netAmount = amount - totalFees;

    // Call the atomic request_withdrawal RPC (debits wallet)
    const { data: withdrawalId, error } = await admin.rpc("request_withdrawal", {
      p_user_id: user.id,
      p_amount: amount,
      p_phone: phone,
      p_operator_ref_id: operatorRefId,
      p_operator_name: operatorName,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Record fees (store on the withdrawal record for transparency)
    if (totalFees > 0) {
      await admin
        .from("withdrawals")
        .update({
          fee: totalFees,
          net_amount: netAmount,
        })
        .eq("id", withdrawalId);
    }

    // Check if auto-approve is enabled (from platform_settings, also synced to withdrawal_config)
    if (wConfig.auto_approve) {
      try {
        const { data: withdrawal, error: claimError } = await admin
          .from("withdrawals")
          .update({ status: "approved", processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", withdrawalId)
          .eq("status", "pending")
          .select("*")
          .single();

        if (claimError || !withdrawal) {
          return NextResponse.json({ withdrawalId, status: "pending" });
        }

        // Initiate Paychangu payout (net amount after fees)
        const chargeId = `wd_${withdrawal.id.slice(0, 8)}_${Date.now()}`;
        const amountMWK = (netAmount || withdrawal.amount);
        let payoutSucceeded = false;

        try {
          const payoutResponse = await fetch("https://api.paychangu.com/mobile-money/payouts/initialize", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              mobile: withdrawal.phone,
              mobile_money_operator_ref_id: withdrawal.operator_ref_id,
              amount: String(amountMWK),
              charge_id: chargeId,
            }),
          });

          const payoutData = await payoutResponse.json();

          if (payoutData.status === "success" || payoutData.status === "pending") {
            payoutSucceeded = true;
            await admin
              .from("withdrawals")
              .update({ status: "completed", charge_id: chargeId, updated_at: new Date().toISOString() })
              .eq("id", withdrawalId);

            try {
              await admin.from("notifications").insert({
                user_id: withdrawal.user_id,
                type: "withdrawal_approved",
                title: "Your withdrawal has been processed",
                body: `MWK ${amountMWK} has been sent to ${withdrawal.phone} via ${withdrawal.operator_name}.`,
                data: { amount: amountMWK, phone: withdrawal.phone, operator: withdrawal.operator_name, auto: true, fees: totalFees },
                read: false,
              });
            } catch {}
          }
        } catch (payoutErr: any) {
          console.error("Auto-approve payout error:", payoutErr);
        }

        if (!payoutSucceeded) {
          await admin.rpc("refund_withdrawal", { p_withdrawal_id: withdrawalId, p_admin_id: null });
          try {
            await admin.from("notifications").insert({
              user_id: withdrawal.user_id,
              type: "withdrawal_failed",
              title: "Withdrawal payout failed",
              body: `Your withdrawal for MWK ${amountMWK} could not be processed. Funds returned to your wallet.`,
              data: { amount: amountMWK, auto: true },
              read: false,
            });
          } catch {}
          return NextResponse.json({ withdrawalId, status: "rejected", error: "Payout failed. Wallet has been refunded." });
        }

        try {
          await admin.from("admin_logs").insert({
            admin_id: null,
            action: "withdrawal_auto_approve",
            target_type: "withdrawal",
            target_id: withdrawalId,
            details: { amount: amountMWK, phone: withdrawal.phone, charge_id: chargeId, auto: true, fees: totalFees },
          });
        } catch {}

        return NextResponse.json({ withdrawalId, status: "completed", chargeId, auto: true });
      } catch (autoErr: any) {
        console.error("Auto-approve error:", autoErr);
        return NextResponse.json({ withdrawalId, status: "pending" });
      }
    }

    return NextResponse.json({ withdrawalId, status: "pending" });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to request withdrawal. Please try again." }, { status: 500 });
  }
}
