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

    const body = await req.json().catch(() => ({}));
    const adminNotes = body.notes || "Rejected by admin";

    // Fetch withdrawal info before refunding
    const { data: withdrawal } = await admin
      .from("withdrawals")
      .select("user_id, amount_cents, phone, operator_name, status")
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

    // Add admin notes + processed_by/at (refund_withdrawal RPC doesn't set these)
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

    // Insert in-app notification directly (no self-HTTP fetch)
    const amountMWK = Math.floor(withdrawal.amount_cents / 100);
    try {
      // Send branded email
    const rejWProfile = await admin.from("profiles").select("email").eq("id", withdrawal.user_id).single();
    const rejAmountMWK = Math.floor(withdrawal.amount_cents / 100);
    await sendEmail({
      to: rejWProfile.data?.email || "",
      subject: `Withdrawal update — MK ${rejAmountMWK.toLocaleString()}`,
      template: "withdrawal_rejected",
      data: { amount: `MK ${rejAmountMWK.toLocaleString()}`, currency: "MWK", reason: adminNotes || "Could not be processed" },
    }).catch(() => {});

    await admin.from("notifications").insert({
        user_id: withdrawal.user_id,
        type: "withdrawal_rejected",
        title: "Your withdrawal request was rejected",
        body: `Your withdrawal for MWK ${amountMWK} was rejected. Funds returned to wallet. Reason: ${adminNotes}`,
        data: { amount: amountMWK, reason: adminNotes },
        read: false,
      });
    } catch {}

    // Log action
    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: "withdrawal_reject",
        target_type: "withdrawal",
        target_id: id,
        details: { notes: adminNotes },
      });
    } catch {}

    return NextResponse.json({ status: "rejected" });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to reject withdrawal. Please try again." }, { status: 500 });
  }
}
