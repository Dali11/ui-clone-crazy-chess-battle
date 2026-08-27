import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — fetch battle config (already exists at /api/battles/config, but this keeps admin endpoints together)
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: config } = await admin.from("battle_config").select("*").limit(1).single();
    return NextResponse.json(config || {});
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH — update battle config
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { id, ...updates } = body;

    // Whitelist fields that can be updated
    const allowedFields = [
      "stake", "platform_fee_pct", "rating_range",
      "initial_minutes", "increment_seconds", "armageddon_pct",
      "max_armageddon_rounds", "queue_timeout_s",
      "stake_levels", "enabled", "min_games_for_battles"
    ];

    const cleanUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of allowedFields) {
      if (updates[field] !== undefined) {
        const val = updates[field];
        if (field === "enabled" && typeof val === "boolean") {
          cleanUpdates[field] = val;
        } else if (field === "stake_levels" && Array.isArray(val)) {
          cleanUpdates[field] = val.map((n) => Number(n)).filter((n) => !isNaN(n));
        } else if (typeof val === "number" && val >= 0) {
          cleanUpdates[field] = val;
        }
      }
    }

    if (!id) {
      // Try to update the first/only config row
      const { data: config, error } = await admin
        .from("battle_config")
        .update(cleanUpdates)
        .gt("id", "00000000-0000-0000-0000-000000000000")
        .select("*")
        .limit(1)
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(config);
    }

    const { data: config, error } = await admin
      .from("battle_config")
      .update(cleanUpdates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Log
    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: "battle_config_update",
        target_type: "battle_config",
        target_id: id,
        details: cleanUpdates,
      });
    } catch {}

    return NextResponse.json(config);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
