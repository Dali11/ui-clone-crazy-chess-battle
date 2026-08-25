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
      min_amount_cents: wConfig.min_amount_cents || 1_000_000,
      max_amount_cents: wConfig.max_amount_cents || 50_000_000,
      daily_limit_cents: wConfig.daily_limit_cents || 0,
      withdrawal_fee_cents: wConfig.withdrawal_fee_cents || 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
