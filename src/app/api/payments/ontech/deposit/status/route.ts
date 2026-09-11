import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ontechCollectionStatus } from "@/lib/payments/ontech";

/**
 * Poll an Ontech deposit. Client polls every few seconds while the player
 * approves the mobile money PIN prompt. On success the wallet is credited
 * exactly once — atomic pending→processing claim (mirrors /api/payments/verify).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { chargeId } = await req.json();
    if (!chargeId) return NextResponse.json({ error: "chargeId required" }, { status: 400 });

    const admin = createAdminClient();
    const { data: deposit } = await admin.from("deposits")
      .select("id, amount, status, charge_id, tx_ref, currency, amount_local, fx_rate")
      .eq("charge_id", chargeId).eq("user_id", user.id).single();
    if (!deposit) return NextResponse.json({ error: "Deposit not found" }, { status: 404 });

    if (deposit.status === "success") {
      return NextResponse.json({ status: "success", amount: deposit.amount });
    }
    if (deposit.status === "failed") {
      return NextResponse.json({ status: "failed" });
    }
    if (deposit.status !== "pending" && deposit.status !== "processing") {
      return NextResponse.json({ status: "failed" });
    }

    // Ask Ontech for the authoritative status
    const st = await ontechCollectionStatus(deposit.tx_ref, deposit.charge_id);

    if (st.status === "success") {
      // Atomic claim — only one poller credits the wallet
      const { data: claimed } = await admin.from("deposits")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", deposit.id)
        .in("status", ["pending", "processing"])
        .select("id").single();

      if (!claimed) {
        // Someone else already moved it — final status will be readable next poll
        const { data: fresh } = await admin.from("deposits").select("status").eq("id", deposit.id).single();
        return NextResponse.json({ status: fresh?.status === "success" ? "success" : "pending" });
      }

      // Credit wallet in MWK (deposit.amount is MWK units)
      await admin.rpc("credit_wallet", { p_user_id: user.id, p_amount: deposit.amount });

      await admin.from("deposits")
        .update({ status: "success", updated_at: new Date().toISOString() })
        .eq("id", deposit.id);

      try {
        await admin.from("notifications").insert({
          user_id: user.id,
          type: "deposit_success",
          title: "Deposit received",
          body: `Your K${deposit.amount_local} deposit is now in your wallet.`,
          data: { deposit_id: deposit.id, currency: "ZMW", amount_local: deposit.amount_local, amount_mwk: deposit.amount },
          read: false,
        });
      } catch {}

      return NextResponse.json({ status: "success", amount: deposit.amount, amountZmw: deposit.amount_local });
    }

    if (st.status === "failed") {
      await admin.from("deposits")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", deposit.id)
        .eq("status", "pending");
      return NextResponse.json({ status: "failed" });
    }

    // still pending (or unknown) — keep polling
    return NextResponse.json({ status: "pending" });
  } catch {
    return NextResponse.json({ status: "pending" });
  }
}
