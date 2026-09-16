import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Real payment methods only — excludes internal audit entries like
// battle_escrow, battle_payout, battle_refund, tournament_entry,
// tournament_payout, tournament_refund, tournament_creator_profit, platform_cut.
// Those are ledger entries, not money entering the platform.
// AUDIT FIX 2026-09-16: pawapay deposits were missing here, so the admin
// Deposits queue could not see real PawaPay money-in at all. (Ontech gateway
// retired same day — migration 086.)
const PAYMENT_METHODS = ["mobile_money", "card", "bank_transfer", "pawapay"];

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
        id, user_id, amount, status, method, charge_id, tx_ref,
        paychangu_ref, phone, operator, reference, created_at, updated_at,
        profiles!deposits_user_id_profiles_fkey(username, display_name, email)
      `)
      .in("method", PAYMENT_METHODS)
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
