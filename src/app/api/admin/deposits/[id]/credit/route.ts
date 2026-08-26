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
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { notes } = body;

    // Fetch deposit
    const { data: deposit } = await admin
      .from("deposits")
      .select("id, user_id, amount_cents, status, method, charge_id")
      .eq("id", id)
      .single();

    if (!deposit) return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
    if (deposit.status === "success") return NextResponse.json({ error: "Deposit already credited" }, { status: 400 });

    // ATOMIC CLAIM: Set status to 'success' first — prevents double-crediting on concurrent requests
    // Only succeeds if the deposit is still in pending/processing (not already claimed)
    const { data: claimed } = await admin
      .from("deposits")
      .update({
        status: "success",
        updated_at: new Date().toISOString(),
        admin_notes: notes || "Manually credited by admin",
        credited_by: user.id,
      })
      .eq("id", id)
      .in("status", ["pending", "processing"])
      .select("id");

    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ error: "Deposit was already claimed by another process" }, { status: 409 });
    }

    // Now safe to credit wallet — no concurrent request can reach this point
    await admin.rpc("credit_wallet", {
      p_user_id: deposit.user_id,
      p_amount_cents: deposit.amount_cents,
    });

    // Trigger referral activation
    try {
      await admin.rpc("check_referral_activation", { p_user_id: deposit.user_id, p_action: "deposit" });
    } catch {}

    // Notify user
    const amountMWK = Math.floor(deposit.amount_cents / 100);
    try {
      // Send branded email
      const depProfile = await admin.from("profiles").select("email").eq("id", deposit.user_id).single();
      // Fetch actual wallet balance after credit
      const { data: depWallet } = await admin.from("profiles").select("wallet_balance_cents").eq("id", deposit.user_id).single();
      const depBalanceMWK = depWallet?.wallet_balance_cents ? Math.floor(depWallet.wallet_balance_cents / 100).toLocaleString() : amountMWK.toLocaleString();

      await sendEmail({
        to: depProfile.data?.email || "",
        subject: `Deposit confirmed — MK ${amountMWK.toLocaleString()}`,
        template: "deposit_credited",
        data: { amount: `MK ${amountMWK.toLocaleString()}`, currency: "MWK", newBalance: `MK ${depBalanceMWK}`, method: deposit.method },
      }).catch(() => {});

      await admin.from("notifications").insert({
        user_id: deposit.user_id,
        type: "deposit_success",
        title: "Deposit confirmed",
        body: `Your deposit of MWK ${amountMWK.toLocaleString()} has been credited to your wallet.`,
        data: { amount: amountMWK, method: deposit.method },
        read: false,
      });
    } catch {}

    // Log action
    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: "manual_credit",
        target_type: "deposit",
        target_id: id,
        details: { amount: amountMWK, notes, original_status: deposit.status },
      });
    } catch {}

    return NextResponse.json({ status: "success", amount: deposit.amount_cents });
  } catch {
    return NextResponse.json({ error: "Failed to credit deposit" }, { status: 500 });
  }
}
