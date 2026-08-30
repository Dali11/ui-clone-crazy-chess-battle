import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET — list all countries with user counts for the admin dashboard filter.
 * Returns [{ country, count }] ordered by count descending.
 */
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

    const { data, error } = await admin
      .from("profiles")
      .select("country")
      .not("country", "is", null);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Count users per country
    const countryCounts: Record<string, number> = {};
    const nullCount = (data || []).filter((r: any) => !r.country).length;

    for (const row of data || []) {
      const c = row.country;
      if (c) {
        countryCounts[c] = (countryCounts[c] || 0) + 1;
      }
    }

    const countries = Object.entries(countryCounts)
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      countries,
      unassigned: nullCount,
      total: (data || []).length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to fetch countries" }, { status: 500 });
  }
}
