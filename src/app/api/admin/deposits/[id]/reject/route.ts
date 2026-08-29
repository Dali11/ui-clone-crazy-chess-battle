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
      .select("id, user_id, amount, status, method")
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reject deposit error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
