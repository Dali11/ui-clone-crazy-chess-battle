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

    const body = await req.json().catch(() => ({}));
    const adminNotes = body.notes || "Rejected by admin";

    // Fetch withdrawal info before refunding
    const { data: withdrawal } = await admin
      .from("withdrawals")
      .select("user_id, amount, phone, operator_name, status")
      .eq("id", id)
      .single();

    if (!withdrawal) return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 });
    if (withdrawal.status !== "pending") return NextResponse.json({ error: `Withdrawal is already ${withdrawal.status}` }, { status: 400 });

    // Refund wallet and mark rejected
    const { error } = await admin.rpc("refund_withdrawal", {
      p_withdrawal_id: id,
      p_admin_id: user.id,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    // Add admin notes + processed_by/at
    await admin
      .from("withdrawals")
      .update({
        admin_notes: adminNotes,
        rejection_reason: adminNotes,
        processed_by: user.id,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reject withdrawal error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
