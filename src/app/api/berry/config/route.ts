import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Public berry config endpoint for the wallet page.
 * Returns only display-relevant fields (no admin-only data).
 *
 * Rate: 1000 berries = MWK 500 (100 berries = MWK 50 = 5000 cents)
 * Minimum redemption: 10,000 berries
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: config } = await admin
      .from("berry_config")
      .select("berry_value, min_redemption, enabled, berries_per_win, berries_per_draw")
      .limit(1)
      .single();

    return NextResponse.json(config || {
      berry_value: 5000,
      min_redemption: 10000,
      enabled: true,
      berries_per_win: 10,
      berries_per_draw: 2,
    });
  } catch {
    return NextResponse.json({
      berry_value: 5000,
      min_redemption: 10000,
      enabled: true,
      berries_per_win: 10,
      berries_per_draw: 2,
    });
  }
}
