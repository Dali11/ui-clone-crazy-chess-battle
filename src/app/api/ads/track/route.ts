import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/ads/track — fire-and-forget impression/click counter for a
 * live direct-ad campaign. Authenticated (players only), atomic RPC.
 * Never throws to the client; analytics must not break rendering.
 */
export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new NextResponse(null, { status: 204 });

    const { campaignId, kind } = await req.json();
    if (typeof campaignId !== "string" || !/^[0-9a-f-]{36}$/.test(campaignId)) {
      return new NextResponse(null, { status: 204 });
    }
    if (kind !== "impression" && kind !== "click") return new NextResponse(null, { status: 204 });

    const admin = createAdminClient();
    await admin.rpc("increment_ad_stat", { p_campaign: campaignId, p_kind: kind });
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
