import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
    const { status } = body;

    if (!status || !["active", "completed", "upcoming"].includes(status)) {
      return NextResponse.json(
        { error: "Valid status required: active, completed, or upcoming" },
        { status: 400 }
      );
    }

    // Fetch existing season
    const { data: season, error: fetchErr } = await admin
      .from("competitive_seasons")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !season) {
      return NextResponse.json({ error: "Season not found" }, { status: 404 });
    }

    // Update season status
    const { data: updatedSeason, error: updateErr } = await admin
      .from("competitive_seasons")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // If status === 'active', link all matching premier_leagues to this season
    if (status === "active") {
      let query = admin.from("premier_leagues").update({
        season_id: id,
        updated_at: new Date().toISOString(),
      });

      if (season.country && season.country !== "Global" && season.country !== "ALL") {
        query = query.eq("country", season.country);
      } else {
        query = query.not("id", "is", null);
      }

      const { error: leagueErr } = await query;
      if (leagueErr) {
        console.error("Failed to link leagues to season:", leagueErr);
      }
    }

    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: "season_status_update",
        target_type: "season",
        target_id: id,
        details: { status, country: season.country },
      });
    } catch {}

    return NextResponse.json(updatedSeason);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to update season" }, { status: 500 });
  }
}
