import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — fetch settings for one section, or all sections
// Usage: GET /api/admin/platform-settings?section=deposits
//        GET /api/admin/platform-settings (returns all)
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const section = req.nextUrl.searchParams.get("section");

    if (section) {
      const { data } = await admin.from("platform_settings").select("*").eq("section", section).single();
      return NextResponse.json(data || { section, config: {} });
    }

    const { data } = await admin.from("platform_settings").select("*").order("section");
    return NextResponse.json(data || []);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH — update settings for a section
// Body: { section: "deposits", config: { ...partialUpdates } }
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const { section, config: newConfig } = body;

    if (!section || typeof section !== "string") {
      return NextResponse.json({ error: "section is required" }, { status: 400 });
    }

    // Fetch existing config to merge
    const { data: existing } = await admin.from("platform_settings").select("*").eq("section", section).single();

    const mergedConfig = { ...(existing?.config || {}), ...(newConfig || {}) };

    let result;
    if (existing?.id) {
      result = await admin
        .from("platform_settings")
        .update({ config: mergedConfig, updated_at: new Date().toISOString(), updated_by: user.id })
        .eq("id", existing.id)
        .select("*")
        .single();
    } else {
      result = await admin
        .from("platform_settings")
        .insert({ section, config: mergedConfig, updated_by: user.id })
        .select("*")
        .single();
    }

    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });

    // Log the change
    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: "platform_settings_update",
        target_type: "platform_settings",
        target_id: existing?.id,
        details: { section, changes: newConfig },
      });
    } catch {}

    return NextResponse.json(result.data);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
