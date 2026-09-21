import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Get/set battle config (admin only).
 * GET: returns current config
 * PUT: updates config
 */
// GET is used by the public battles page for ALL players to check if
// Chess Battles are enabled and to read stake levels/time controls.
// It must NOT be admin-gated — only PUT (updating config) requires admin.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: config, error } = await admin.from("battle_config").select("*").limit(1).single();

    // A real DB/connectivity error (or a genuinely missing row) must NOT be
    // reported as "battles: false" — that was the bug: any transient outage
    // silently rendered as a normal 200 response shaped like a real config
    // with enabled:false, so the battles page showed players a permanent-
    // looking "Chess Battles are currently disabled" message during outages
    // that had nothing to do with an admin actually disabling battles.
    if (error || !config) {
      return NextResponse.json({ error: "Failed to fetch config" }, { status: 503 });
    }

    return NextResponse.json(config);
  } catch {
    return NextResponse.json({ error: "Failed to fetch config" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const body = await req.json();

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const allowed = [
      "enabled", "stake_levels", "platform_fee_pct", "rating_range",
      "queue_timeout_s", "initial_minutes", "increment_seconds",
      "armageddon_pct", "max_armageddon_rounds", "disconnect_timeout_s",
      "min_games_for_battles",
    ];

    for (const key of allowed) {
      if (key in body) update[key] = body[key];
    }

    const { data: existing } = await admin.from("battle_config").select("id").limit(1).single();

    if (existing) {
      const { data: updated, error } = await admin
        .from("battle_config")
        .update(update)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(updated);
    }

    const { data: created, error: createErr } = await admin
      .from("battle_config")
      .insert(update)
      .select()
      .single();
    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
    return NextResponse.json(created);
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to update config" }, { status: 500 });
  }
}
