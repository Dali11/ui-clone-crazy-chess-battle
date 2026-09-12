import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";
import { isMember, daysRemaining } from "@/lib/membership/membership";

export const dynamic = "force-dynamic";

/**
 * GET /api/membership/status
 * Lightweight membership state for the current player (wallet card + AdSlot
 * suppression). Returns { member, until, daysLeft, price, enabled } —
 * config is only included for the purchase UI, AdSlot callers ignore it.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const admin = createAdminClient();
    const cfg = await getPlatformConfig(admin, "membership");

    let member = false;
    let until: string | null = null;
    let daysLeft = 0;
    let country: string | null = null;

    if (user) {
      const { data: profile } = await admin
        .from("profiles")
        .select("membership_until, country")
        .eq("id", user.id)
        .single();
      const now = new Date().toISOString();
      member = isMember(profile?.membership_until, now);
      until = member ? profile!.membership_until : null;
      daysLeft = daysRemaining(profile?.membership_until, now);
      country = profile?.country || null;
    }

    return NextResponse.json({
      member,
      until,
      daysLeft,
      enabled: !!cfg.enabled,
      price: cfg.price_mwk || 10000,
      periodDays: cfg.period_days || 30,
      // MW-only for now (PayChangu rails); ZM/other countries: coming soon
      available: country === "MW",
    });
  } catch {
    return NextResponse.json({ member: false }, { status: 200 });
  }
}
