import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/audience — live player counts per country × gender, so
 * the /advertise form can show honest reach estimates for targeting.
 * Gender-targeted campaigns never serve to players who haven't set a
 * gender, so the counts expose that reality honestly.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("profiles")
      .select("country,gender");
    if (error) return NextResponse.json({ error: "Failed to load audience" }, { status: 500 });

    const crossTab: Record<string, { total: number; male: number; female: number }> = {};
    let total = 0;
    for (const p of data || []) {
      total++;
      const c = p.country || "ZZ";
      crossTab[c] ||= { total: 0, male: 0, female: 0 };
      crossTab[c].total++;
      if (p.gender === "male") crossTab[c].male++;
      if (p.gender === "female") crossTab[c].female++;
    }
    return NextResponse.json({ total, countries: crossTab });
  } catch {
    return NextResponse.json({ error: "Failed to load audience" }, { status: 500 });
  }
}
