import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/active — one live direct-ad campaign for AdSlot rotation.
 * Fair-ish rotation: random pick among active, unexpired campaigns.
 * Returns { campaign } or { campaign: null }. No creative-pricing or
 * advertiser identity leaks beyond the public creative itself.
 */
export async function GET() {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("ad_campaigns")
      .select("id,headline,body,image_url,target_url,business_name")
      .eq("status", "active")
      .lt("starts_at", new Date().toISOString())
      .gt("ends_at", new Date().toISOString())
      .limit(5);
    if (error || !data?.length) return NextResponse.json({ campaign: null });
    return NextResponse.json({ campaign: data[Math.floor(Math.random() * data.length)] });
  } catch {
    return NextResponse.json({ campaign: null });
  }
}
