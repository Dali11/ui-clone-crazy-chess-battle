import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/active — one live direct-ad campaign for AdSlot rotation,
 * filtered to the requesting player's audience slice.
 *
 * A campaign with target_country/target_gender only serves to players
 * who match; untargeted campaigns serve to everyone. Players who never
 * set gender (most of the base) only see ungendered campaigns — a
 * "female" ad never guesses. Anonymous visitors see untargeted only.
 */
export async function GET() {
  try {
    let country: string | null = null;
    let gender: string | null = null;
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const admin = createAdminClient();
        const { data: profile } = await admin
          .from("profiles")
          .select("country,gender")
          .eq("id", user.id)
          .single();
        country = profile?.country || null;
        gender = profile?.gender || null;
      }
    } catch {}

    const admin = createAdminClient();
    const countryClause = country
      ? `target_country.eq.${country},target_country.is.null`
      : "target_country.is.null";
    const genderClause = gender
      ? `target_gender.eq.${gender},target_gender.is.null`
      : "target_gender.is.null";

    const { data, error } = await admin
      .from("ad_campaigns")
      .select("id,headline,body,image_url,target_url,business_name")
      .eq("status", "active")
      .lt("starts_at", new Date().toISOString())
      .gt("ends_at", new Date().toISOString())
      .or(countryClause)
      .or(genderClause)
      .limit(5);
    if (error || !data?.length) return NextResponse.json({ campaign: null });
    return NextResponse.json({ campaign: data[Math.floor(Math.random() * data.length)] });
  } catch {
    return NextResponse.json({ campaign: null });
  }
}
