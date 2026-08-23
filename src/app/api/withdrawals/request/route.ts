import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { amountCents, phone, operatorRefId, operatorName } = await req.json();

    // Minimum withdrawal is MWK 10,000 (1,000,000 cents)
    if (!amountCents || amountCents < 1000000) {
      return NextResponse.json({ error: "Minimum withdrawal is MWK 10,000" }, { status: 400 });
    }
    if (!phone || !operatorRefId || !operatorName) {
      return NextResponse.json({ error: "Phone, operator required" }, { status: 400 });
    }

    // Validate phone format (Malawi: 08x, 09x, +265, 265)
    const phoneDigits = phone.replace(/\D/g, "");
    const localPhone = phoneDigits.startsWith("265") ? "0" + phoneDigits.slice(3) : phoneDigits;
    if (localPhone.length < 9 || !localPhone.match(/^0[89]/)) {
      return NextResponse.json({ error: "Invalid Malawi mobile money number" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Check for existing pending withdrawal (prevent spam)
    const { data: existingPending } = await admin
      .from("withdrawals")
      .select("id, amount_cents")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .limit(1);

    if (existingPending && existingPending.length > 0) {
      return NextResponse.json({ error: "You already have a pending withdrawal. Wait for it to be processed before requesting another." }, { status: 400 });
    }

    // Call the atomic request_withdrawal RPC
    const { data: withdrawalId, error } = await admin.rpc("request_withdrawal", {
      p_user_id: user.id,
      p_amount_cents: amountCents,
      p_phone: phone,
      p_operator_ref_id: operatorRefId,
      p_operator_name: operatorName,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Check if auto-approve is enabled
    const { data: wConfig } = await admin
      .from("withdrawal_config")
      .select("auto_approve_enabled")
      .limit(1)
      .single();

    if (wConfig?.auto_approve_enabled) {
      // Auto-approve: process the payout immediately
      try {
        // Atomic claim: only approve if still pending
        const { data: withdrawal, error: claimError } = await admin
          .from("withdrawals")
          .update({ status: "approved", processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", withdrawalId)
          .eq("status", "pending")
          .select("*")
          .single();

        if (claimError || !withdrawal) {
          // Already being processed by an admin — return pending status
          return NextResponse.json({ withdrawalId, status: "pending" });
        }

        // Initiate Paychangu payout
        const chargeId = `wd_${withdrawal.id.slice(0, 8)}_${Date.now()}`;
        const amountMWK = Math.floor(withdrawal.amount_cents / 100);
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
                data: { amount: amountMWK, phone: withdrawal.phone, operator: withdrawal.operator_name, auto: true },
                read: false,
              });
            } catch {}
          }
        } catch (payoutErr: any) {
          console.error("Auto-approve payout error:", payoutErr);
        }

        if (!payoutSucceeded) {
          // Payout failed — refund the wallet
          await admin.rpc("refund_withdrawal", {
            p_withdrawal_id: withdrawalId,
            p_admin_id: null,
          });

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

        // Log auto-approval
        try {
          await admin.from("admin_logs").insert({
            admin_id: null,
            action: "withdrawal_auto_approve",
            target_type: "withdrawal",
            target_id: withdrawalId,
            details: { amount: amountMWK, phone: withdrawal.phone, charge_id: chargeId, auto: true },
          });
        } catch {}

        return NextResponse.json({ withdrawalId, status: "completed", chargeId, auto: true });
      } catch (autoErr: any) {
        console.error("Auto-approve error:", autoErr);
        // Fall back to manual approval if auto fails unexpectedly
        return NextResponse.json({ withdrawalId, status: "pending" });
      }
    }

    return NextResponse.json({ withdrawalId, status: "pending" });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to request withdrawal. Please try again." }, { status: 500 });
  }
}
