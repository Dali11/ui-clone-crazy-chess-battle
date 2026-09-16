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
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    
    let query = admin
      .from("withdrawals")
      .select(`
        id, amount, fee, net_amount, currency, phone, operator_name, status, charge_id, admin_notes,
        processed_at, created_at, updated_at,
        user_id, profiles!withdrawals_user_id_profiles_fkey(username, display_name, email)
      `)
      .order("created_at", { ascending: false })
      .limit(50);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: withdrawals, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ withdrawals });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to fetch withdrawals" }, { status: 500 });
  }
}
