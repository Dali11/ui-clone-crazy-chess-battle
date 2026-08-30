import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Atomic claim: only update if still pending
    const { data: withdrawal, error: claimError } = await admin
      .from("withdrawals")
      .update({ status: "approved", processed_by: user.id, processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select("*")
      .single();

    if (claimError || !withdrawal) {
      const { data: existing } = await admin.from("withdrawals").select("status").eq("id", id).single();
      if (!existing) return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 });
      return NextResponse.json({ error: `Withdrawal is already ${existing.status}` }, { status: 400 });
    }

    // ─── Use net_amount (after fees) for the payout ──────────────────────
    // The fee was calculated and stored when the withdrawal was requested.
    // We must send the NET amount to PayChangu, not the gross amount.
    const fee = withdrawal.fee || 0;
    const grossAmount = withdrawal.amount;
    const netAmount = withdrawal.net_amount || (grossAmount - fee);

    // Initiate Paychangu mobile money payout (net amount only)
    const chargeId = `wd_${withdrawal.id.slice(0, 8)}_${Date.now()}`;
    const amountMWK = netAmount;

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
          .eq("id", id);
      }
    } catch (payoutErr: any) {
      console.error("Payout API error:", payoutErr);
    }

    if (!payoutSucceeded) {
      // Payout failed — refund the wallet
      await admin.rpc("refund_withdrawal", { p_withdrawal_id: id, p_admin_id: user.id });

      try {
        await admin.from("notifications").insert({
          user_id: withdrawal.user_id,
          type: "withdrawal_failed",
          title: "Withdrawal payout failed",
          body: `Your withdrawal for MWK ${grossAmount} could not be processed. Funds returned to your wallet.`,
          data: { amount: grossAmount },
          read: false,
        });
      } catch {}

      return NextResponse.json({ error: "Payout failed. Wallet has been refunded." }, { status: 500 });
    }

    // Log action with fee breakdown
    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: "withdrawal_approve",
        target_type: "withdrawal",
        target_id: id,
        details: {
          gross_amount: grossAmount,
          fee: fee,
          net_amount: netAmount,
          phone: withdrawal.phone,
          charge_id: chargeId,
        },
      });
    } catch {}

    // Notify the user
    try {
      await admin.from("notifications").insert({
        user_id: withdrawal.user_id,
        type: "withdrawal_approved",
        title: "Withdrawal approved",
        body: `Your withdrawal of MWK ${grossAmount} (fee: MWK ${fee}, payout: MWK ${netAmount}) has been processed to ${withdrawal.phone} via ${withdrawal.operator_name}.`,
        data: { gross_amount: grossAmount, fee, net_amount: netAmount, phone: withdrawal.phone, operator: withdrawal.operator_name },
        read: false,
      });
    } catch {}

    return NextResponse.json({ status: "completed", chargeId, grossAmount, fee, netAmount });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to approve withdrawal. Please try again." }, { status: 500 });
  }
}
