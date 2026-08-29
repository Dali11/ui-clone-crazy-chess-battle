import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { chargeId } = await req.json();
    if (!chargeId) return NextResponse.json({ error: "Charge ID required" }, { status: 400 });

    const admin = createAdminClient();
    let { data: deposit } = await admin
      .from("deposits")
      .select("id, user_id, amount, status, method")
      .eq("charge_id", chargeId)
      .single();

    if (!deposit) {
      const { data: txDeposit } = await admin
        .from("deposits")
        .select("id, user_id, amount, status, method")
        .eq("tx_ref", chargeId)
        .single();
      deposit = txDeposit;
    }

    if (!deposit) return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
    if (deposit.user_id !== user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    // Already successfully processed — return immediately (idempotent)
    if (deposit.status === "success") {
      return NextResponse.json({ status: "success", depositId: deposit.id, amount: deposit.amount });
    }

    // Already being processed by another request — return pending
    if (deposit.status === "processing") {
      return NextResponse.json({ status: "pending", depositId: deposit.id });
    }

    // Correct PayChangu endpoints per https://developer.paychangu.com/docs/charge-verification
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
      // ATOMIC GUARD: claim this deposit by atomically moving it from "pending" to "processing"
      // If another concurrent request already claimed it, this returns 0 rows and we skip crediting
      const { data: claimed, error: claimErr } = await admin
        .from("deposits")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", deposit.id)
        .eq("status", "pending")
        .select("id");

      if (claimErr || !claimed || claimed.length === 0) {
        // Another request is already processing or has processed this deposit
        return NextResponse.json({ status: "success", depositId: deposit.id, amount: deposit.amount });
      }

      // We won the race — safe to credit the wallet
      await admin.rpc("credit_wallet", {
        p_user_id: user.id,
        p_amount: deposit.amount,
      });

      // Mark as success
      await admin.from("deposits")
        .update({ status: "success", updated_at: new Date().toISOString() })
        .eq("id", deposit.id);

      // Notify user
      const amountMWK = deposit.amount;
      try {
        await admin.from("notifications").insert({
          user_id: user.id,
          type: "deposit_success",
          title: "Deposit confirmed",
          body: `Your deposit of MWK ${amountMWK.toLocaleString()} has been credited to your wallet.`,
          data: { amount: amountMWK, method: deposit.method },
          read: false,
        });
      } catch {}

      return NextResponse.json({ status: "success", depositId: deposit.id, amount: deposit.amount });
    }

    if (remoteStatus === "failed" || remoteStatus === "cancelled") {
      await admin.from("deposits")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", deposit.id);
      return NextResponse.json({ status: "failed", depositId: deposit.id });
    }

    return NextResponse.json({ status: remoteStatus || "pending", depositId: deposit.id });
  } catch (e: any) {
    console.error("Verify error:", e);
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}
