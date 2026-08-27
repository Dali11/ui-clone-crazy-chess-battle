import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — fetch berry config
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Check admin
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data: config } = await admin.from("berry_config").select("*").limit(1).single();
    return NextResponse.json(config || {});
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH — update berry config
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Check admin
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { berries_per_win, berries_per_draw, berry_value, min_redemption, enabled } = body;

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (berries_per_win !== undefined) updates.berries_per_win = berries_per_win;
    if (berries_per_draw !== undefined) updates.berries_per_draw = berries_per_draw;
    if (berry_value !== undefined) updates.berry_value = berry_value;
    if (min_redemption !== undefined) updates.min_redemption = min_redemption;
    if (enabled !== undefined) updates.enabled = enabled;

    const { data: config, error } = await admin
      .from("berry_config")
      .update(updates)
      .eq("id", body.id)
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(config);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
