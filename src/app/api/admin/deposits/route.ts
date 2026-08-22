import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const method = url.searchParams.get("method");

    let query = admin
      .from("deposits")
      .select(`
        id, user_id, amount_cents, status, method, charge_id, tx_ref,
        paychangu_ref, phone, operator, reference, created_at, updated_at,
        profiles!inner(username, display_name, email)
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (status && status !== "all") query = query.eq("status", status);
    if (method && method !== "all") query = query.eq("method", method);

    const { data: deposits, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ deposits });
  } catch {
    return NextResponse.json({ error: "Failed to fetch deposits" }, { status: 500 });
  }
}
