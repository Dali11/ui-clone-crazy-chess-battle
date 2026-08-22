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

    // Credit wallet
    await admin.rpc("credit_wallet", {
      p_user_id: deposit.user_id,
      p_amount_cents: deposit.amount_cents,
    });

    // Mark as success
    await admin.from("deposits")
      .update({ status: "success", updated_at: new Date().toISOString() })
      .eq("id", id);

    // Notify user
    const amountMWK = Math.floor(deposit.amount_cents / 100);
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
