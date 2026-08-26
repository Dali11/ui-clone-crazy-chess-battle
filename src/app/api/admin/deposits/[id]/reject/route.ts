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
      .select("id, user_id, amount_cents, status, method")
      .eq("id", id)
      .single();

    if (!deposit) return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
    if (deposit.status === "success") return NextResponse.json({ error: "Cannot reject a successful deposit" }, { status: 400 });

    // Mark as failed
    await admin.from("deposits")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
        admin_notes: notes || "Rejected by admin",
        credited_by: user.id,
      })
      .eq("id", id);

    // Notify user
    const amountMWK = Math.floor(deposit.amount_cents / 100);
    try {
      // Send branded email
    const rejProfile = await admin.from("profiles").select("email").eq("id", deposit.user_id).single();
    await sendEmail({
      to: rejProfile.data?.email || "",
      subject: `Deposit update — MK ${amountMWK.toLocaleString()} could not be processed`,
      template: "deposit_rejected",
      data: { amount: `MK ${amountMWK.toLocaleString()}`, currency: "MWK", reason: notes || "Deposit could not be verified" },
    }).catch(() => {});

    await admin.from("notifications").insert({
        user_id: deposit.user_id,
        type: "deposit_failed",
        title: "Deposit failed",
        body: `Your deposit of MWK ${amountMWK.toLocaleString()} could not be processed. ${notes || "Please try again or contact support."}`,
        data: { amount: amountMWK, reason: notes },
        read: false,
      });
    } catch {}

    // Log action
    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: "reject_deposit",
        target_type: "deposit",
        target_id: id,
        details: { amount: amountMWK, notes, original_status: deposit.status },
      });
    } catch {}

    return NextResponse.json({ status: "failed" });
  } catch {
    return NextResponse.json({ error: "Failed to reject deposit" }, { status: 500 });
  }
}
