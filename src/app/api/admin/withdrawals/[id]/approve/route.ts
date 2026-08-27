import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

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

    // Atomic claim: only update if still pending (prevents double-approve by concurrent admins)
    const { data: withdrawal, error: claimError } = await admin
      .from("withdrawals")
      .update({ status: "approved", processed_by: user.id, processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "pending")
      .select("*")
      .single();

    if (claimError || !withdrawal) {
      // Check if it exists at all
      const { data: existing } = await admin.from("withdrawals").select("status").eq("id", id).single();
      if (!existing) return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 });
      return NextResponse.json({ error: `Withdrawal is already ${existing.status}` }, { status: 400 });
    }

    // Initiate Paychangu mobile money payout
    const chargeId = `wd_${withdrawal.id.slice(0, 8)}_${Date.now()}`;
    const amountMWK = withdrawal.amount;

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
        // Update with charge_id and mark as completed (Paychangu processes async)
        await admin
          .from("withdrawals")
          .update({ status: "completed", charge_id: chargeId, updated_at: new Date().toISOString() })
          .eq("id", id);

        // Insert in-app notification directly (no self-HTTP fetch)
        try {
          // Send branded email
          const wProfile = await admin.from("profiles").select("email").eq("id", withdrawal.user_id).single();
          await sendEmail({
            to: wProfile.data?.email || "",
            subject: `Withdrawal sent — MK ${amountMWK.toLocaleString()}`,
            template: "withdrawal_approved",
            data: { amount: withdrawal.amount, currency: "MWK", phone: withdrawal.phone, operator: withdrawal.operator_name, reference: chargeId },
          }).catch(() => {});

          await admin.from("notifications").insert({
            user_id: withdrawal.user_id,
            type: "withdrawal_approved",
            title: "Your withdrawal has been approved",
            body: `MWK ${amountMWK} has been sent to ${withdrawal.phone} via ${withdrawal.operator_name}.`,
            data: { amount: amountMWK, phone: withdrawal.phone, operator: withdrawal.operator_name },
            read: false,
          });
        } catch {}
      }
    } catch (payoutErr: any) {
      console.error("Payout API error:", payoutErr);
    }

    if (!payoutSucceeded) {
      // Payout failed — refund the wallet
      await admin.rpc("refund_withdrawal", { p_withdrawal_id: id, p_admin_id: user.id });

      // Insert in-app notification directly
      try {
        await admin.from("notifications").insert({
          user_id: withdrawal.user_id,
          type: "withdrawal_failed",
          title: "Withdrawal payout failed",
          body: `Your withdrawal for MWK ${amountMWK} could not be processed. Funds returned to your wallet.`,
          data: { amount: amountMWK },
          read: false,
        });
      } catch {}

      return NextResponse.json({ error: "Payout failed. Wallet has been refunded." }, { status: 500 });
    }

    // Log action
    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: "withdrawal_approve",
        target_type: "withdrawal",
        target_id: id,
        details: { amount: amountMWK, phone: withdrawal.phone, charge_id: chargeId },
      });
    } catch {}

    return NextResponse.json({ status: "completed", chargeId });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to approve withdrawal. Please try again." }, { status: 500 });
  }
}
