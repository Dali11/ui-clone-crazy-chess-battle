import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET /api/kyc/status — the player's KYC state for the settings page. */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase
      .from("profiles")
      .select("identity_verified, identity_verified_at")
      .eq("id", user.id)
      .single();

    const { data: submissions } = await supabase
      .from("kyc_submissions")
      .select("id, doc_type, doc_number, status, rejection_reason, created_at, reviewed_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1);

    const latest = submissions?.[0] ?? null;
    return NextResponse.json({
      verified: !!profile?.identity_verified,
      verifiedAt: profile?.identity_verified_at ?? null,
      latest,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to load KYC status" }, { status: 500 });
  }
}
