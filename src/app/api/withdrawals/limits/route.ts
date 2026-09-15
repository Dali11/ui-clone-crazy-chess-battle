import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";
import { moneySymbol } from "@/lib/geo/format";

// GET — user-facing withdrawal limits (no admin check, returns only display-relevant fields)
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const wConfig = await getPlatformConfig(admin, "withdrawals");
    const dConfig = await getPlatformConfig(admin, "deposits");

    const { data: _profile } = await admin.from("profiles").select("country").eq("id", user.id).single();
    const sym = moneySymbol(_profile?.country);

    return NextResponse.json({
      enabled: wConfig.enabled !== false,
      min_amount: wConfig.min_amount || 10_000,
      max_amount: wConfig.max_amount || 500_000,
      daily_limit: wConfig.daily_limit || 0,
      processing_fee_pct: wConfig.processing_fee_pct || 0,
      currency_symbol: sym,
      // Deposit limits (MWK; the client converts to the player's currency —
      // the minimum a player can deposit is the MWK minimum's equivalent)
      deposit_enabled: dConfig.enabled !== false,
      deposit_min_amount: dConfig.min_amount || 1000,
      deposit_max_amount: dConfig.max_amount || 500_000,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
