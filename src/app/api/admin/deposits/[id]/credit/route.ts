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
      .select("id, user_id, amount, status, method, charge_id")
      .eq("id", id)
      .single();

    if (!deposit) return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
    if (deposit.status === "success") return NextResponse.json({ error: "Deposit already credited" }, { status: 400 });

    // ATOMIC CLAIM: Set status to 'success' first — prevents double-crediting on concurrent requests
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

    // Now safe to credit wallet
    await admin.rpc("credit_wallet", {
      p_user_id: deposit.user_id,
      p_amount: deposit.amount,
    });

    // Trigger referral activation
    try {
      await admin.rpc("check_referral_activation", { p_user_id: deposit.user_id, p_action: "deposit" });
    } catch {}

    // Log action
    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: "manual_credit",
        target_type: "deposit",
        target_id: id,
        details: { amount: deposit.amount, notes, original_status: deposit.status },
      });
    } catch {}

    return NextResponse.json({ status: "success", amount: deposit.amount });
  } catch {
    return NextResponse.json({ error: "Failed to credit deposit" }, { status: 500 });
  }
}
