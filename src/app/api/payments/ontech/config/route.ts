import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";

/**
 * Admin-configured ZM (Ontech) deposit/withdrawal limits, for the client to
 * render quick-amount chips and inline min/max copy without hardcoding
 * numbers that only live in the admin Platform Settings panel.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const zmConfig = await getPlatformConfig(admin, "payments_zm");
  return NextResponse.json({
    enabled: zmConfig.enabled,
    minDepositZmw: zmConfig.min_deposit_zmw,
    maxDepositZmw: zmConfig.max_deposit_zmw,
    minWithdrawalZmw: zmConfig.min_withdrawal_zmw,
    maxWithdrawalZmw: zmConfig.max_withdrawal_zmw,
  });
}
