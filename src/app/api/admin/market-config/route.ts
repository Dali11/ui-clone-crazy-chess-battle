import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — List all market configs
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

    const { data: configs, error } = await admin
      .from("market_config")
      .select("*")
      .order("is_default", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(configs || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch market config" }, { status: 500 });
  }
}

// PATCH — Update a market config by country_code
export async function PATCH(req: NextRequest) {
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

    const body = await req.json();
    const { country_code, membership_active, membership_price_cents, membership_currency } = body;

    if (!country_code) {
      return NextResponse.json({ error: "country_code is required" }, { status: 400 });
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };

    if (membership_active !== undefined) updates.membership_active = membership_active;
    if (membership_price_cents !== undefined) {
      updates.membership_price_cents = membership_price_cents === null || membership_price_cents === "" ? null : Number(membership_price_cents);
    }
    if (membership_currency !== undefined) updates.membership_currency = membership_currency;

    const { data, error } = await admin
      .from("market_config")
      .update(updates)
      .eq("country_code", country_code)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: "market_config_update",
        target_type: "market_config",
        target_id: country_code,
        details: { updates },
      });
    } catch {}

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update market config" }, { status: 500 });
  }
}
