import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

    const { data: leagues, error } = await admin
      .from("premier_leagues")
      .select("*")
      .order("tier", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const formatted = (leagues || []).map((league) => ({
      ...league,
      participant_count: Array.isArray(league.player_ids) ? league.player_ids.length : 0,
    }));

    return NextResponse.json(formatted);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch leagues" }, { status: 500 });
  }
}
