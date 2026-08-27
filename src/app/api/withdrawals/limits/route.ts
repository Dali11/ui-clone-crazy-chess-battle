import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";

// GET — user-facing withdrawal limits (no admin check, returns only display-relevant fields)
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const wConfig = await getPlatformConfig(admin, "withdrawals");

    return NextResponse.json({
      enabled: wConfig.enabled !== false,
      min_amount: wConfig.min_amount || 10_000,
      max_amount: wConfig.max_amount || 500_000,
      daily_limit: wConfig.daily_limit || 0,
      withdrawal_fee: wConfig.withdrawal_fee || 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
