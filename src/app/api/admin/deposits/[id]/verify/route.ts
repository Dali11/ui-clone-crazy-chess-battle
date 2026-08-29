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
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Fetch deposit
    const { data: deposit } = await admin
      .from("deposits")
      .select("id, user_id, amount, status, method, charge_id, tx_ref")
      .eq("id", id)
      .single();

    if (!deposit) return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
    if (deposit.status === "success") return NextResponse.json({ status: "success", message: "Already credited" });

    const chargeId = deposit.charge_id || deposit.tx_ref;
    if (!chargeId) return NextResponse.json({ error: "No charge ID to verify" }, { status: 400 });

    // Verify with PayChangu
    let verifyUrl: string;
    if (deposit.method === "mobile_money") {
      verifyUrl = `https://api.paychangu.com/mobile-money/payments/${chargeId}/verify`;
    } else {
      verifyUrl = `https://api.paychangu.com/verify-payment/${chargeId}`;
    }

    const res = await fetch(verifyUrl, {
      headers: {
        Authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
        Accept: "application/json",
      },
    });

    const data = await res.json();
    const remoteStatus = data.data?.status || data.status;

    if (remoteStatus === "success" || remoteStatus === "successful") {
      // Atomically claim the deposit — accept both pending AND processing
      const { data: claimed } = await admin
        .from("deposits")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", id)
        .in("status", ["pending", "processing"])
        .select("id");

      if (claimed && claimed.length > 0) {
        await admin.rpc("credit_wallet", {
          p_user_id: deposit.user_id,
          p_amount: deposit.amount,
        });

        await admin.from("deposits")
          .update({ status: "success", updated_at: new Date().toISOString() })
          .eq("id", id);

        const amountMWK = deposit.amount;
        try {
          await admin.from("notifications").insert({
            user_id: deposit.user_id,
            type: "deposit_success",
            title: "Deposit confirmed",
            body: `Your deposit of MWK ${amountMWK.toLocaleString()} has been credited to your wallet.`,
            data: { amount: amountMWK, method: deposit.method },
            read: false,
          });
        } catch {}

        try {
          await admin.from("admin_logs").insert({
            admin_id: user.id,
            action: "verify_credit",
            target_type: "deposit",
            target_id: id,
            details: { amount: amountMWK, paychangu_status: remoteStatus },
          });
        } catch {}

        return NextResponse.json({ status: "success", message: "Deposit verified and credited", amount: deposit.amount });
      }

      return NextResponse.json({ status: "success", message: "Already being processed" });
    }

    if (remoteStatus === "failed" || remoteStatus === "cancelled") {
      await admin.from("deposits")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", id);
      return NextResponse.json({ status: "failed", message: "Payment was not completed at PayChangu" });
    }

    return NextResponse.json({
      status: remoteStatus || "pending",
      message: data.message || "Payment still pending at PayChangu",
      raw: data,
    });
  } catch {
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
