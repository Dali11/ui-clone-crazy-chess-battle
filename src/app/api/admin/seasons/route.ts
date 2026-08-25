import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";

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

    const { data: seasons, error } = await admin
      .from("competitive_seasons")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(seasons || []);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch seasons" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
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
    const { name, country, start_date, end_date, config } = body;

    if (!name || !country) {
      return NextResponse.json({ error: "Name and country are required" }, { status: 400 });
    }

    // ─── Load platform config for seasons ──────────────────────────
    const sConfig = await getPlatformConfig(admin, 'seasons');

    // Apply default duration if not provided
    let finalEndDate = end_date;
    let finalStartDate = start_date;
    if (!finalStartDate) {
      finalStartDate = new Date().toISOString().split('T')[0];
    }
    if (!finalEndDate && sConfig.default_duration_weeks) {
      const end = new Date(finalStartDate);
      end.setDate(end.getDate() + (sConfig.default_duration_weeks * 7));
      finalEndDate = end.toISOString().split('T')[0];
    }

    // Check for overlapping seasons if not allowed
    if (sConfig.allow_overlap === false && finalStartDate && finalEndDate) {
      const { data: overlapping } = await admin
        .from('competitive_seasons')
        .select('id, name')
        .eq('country', country)
        .neq('status', 'ended')
        .or(`start_date.lte.${finalEndDate},end_date.gte.${finalStartDate}`);
      if (overlapping && overlapping.length > 0) {
        return NextResponse.json({ error: `Overlapping season exists: ${overlapping.map(s => s.name).join(', ')}. Enable overlap in settings to allow this.` }, { status: 400 });
      }
    }

    const { data, error } = await admin
      .from("competitive_seasons")
      .insert({
        name,
        country,
        start_date: finalStartDate || null,
        end_date: finalEndDate || null,
        config: config || {},
        status: "upcoming",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: "season_create",
        target_type: "season",
        target_id: data.id,
        details: { name, country },
      });
    } catch {}

    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create season" }, { status: 500 });
  }
}
