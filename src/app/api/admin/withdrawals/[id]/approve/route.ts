import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { initiatePayout } from "@/lib/payments/pawapay";
import { randomUUID } from "crypto";

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

    const fee = withdrawal.fee || 0;
    const grossAmount = withdrawal.amount;
    const netAmount = withdrawal.net_amount || (grossAmount - fee);

    let payoutSucceeded = false;
    const chargeId = `wd_${withdrawal.id.slice(0, 8)}_${Date.now()}`;

    // ── Determine payout provider ───────────────────────────────────────
    const provider = withdrawal.payment_provider || "paychangu";

    if (provider === "pawapay") {
      // ── PawaPay payout ─────────────────────────────────────────────────
      const payoutId = randomUUID();

      // Withdrawal amounts are stored in the player's wallet currency —
      // pay out exactly the net that was debited. No conversion.
      const payoutCurrency = String(withdrawal.currency || "MWK").toUpperCase();

      try {
        const response = await initiatePayout({
          payoutId,
          amount: String(netAmount),
          currency: payoutCurrency,
          phoneNumber: withdrawal.phone,
          provider: withdrawal.operator_ref_id,
        });

        if (response.status === "ACCEPTED" || response.status === "COMPLETED") {
          payoutSucceeded = true;
          await admin
            .from("withdrawals")
            .update({
              status: "completed",
              charge_id: chargeId,
              pawapay_ref: payoutId,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id);
        }
      } catch (payoutErr: any) {
        console.error("PawaPay payout error:", payoutErr);
      }

    } else {
      // ── PayChangu payout (existing logic) ──────────────────────────────
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
            amount: String(netAmount),
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
        console.error("PayChangu payout error:", payoutErr);
      }
    }

    if (!payoutSucceeded) {
      // Payout failed — refund the wallet
      await admin.rpc("refund_withdrawal", { p_withdrawal_id: id, p_admin_id: user.id });

      try {
        await admin.from("notifications").insert({
          user_id: withdrawal.user_id,
          type: "withdrawal_failed",
          title: "Withdrawal payout failed",
          body: `Your withdrawal for ${grossAmount.toLocaleString()} could not be processed. Funds returned to your wallet.`,
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
          provider,
        },
      });
    } catch {}

    // Notify the user
    try {
      const nBody = `Your withdrawal of ${grossAmount.toLocaleString()} (fee: ${fee.toLocaleString()}, payout: ${netAmount.toLocaleString()}) has been processed to ${withdrawal.phone} via ${withdrawal.operator_name}.`;
      await admin.from("notifications").insert({
        user_id: withdrawal.user_id,
        type: "withdrawal_approved",
        title: "Withdrawal approved",
        body: nBody,
        data: { gross_amount: grossAmount, fee, net_amount: netAmount, phone: withdrawal.phone, operator: withdrawal.operator_name, provider },
        read: false,
      });
    } catch {}

    return NextResponse.json({ status: "completed", chargeId, grossAmount, fee, netAmount, provider });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to approve withdrawal. Please try again." }, { status: 500 });
  }
}
