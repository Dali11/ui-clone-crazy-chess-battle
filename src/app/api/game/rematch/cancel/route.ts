import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { offerId } = await req.json();
    if (!offerId) return NextResponse.json({ error: "offerId required" }, { status: 400 });

    const admin = createAdminClient();
    const { data: offer } = await admin
      .from("rematch_offers")
      .select("id, requester_id, status")
      .eq("id", offerId)
      .single();

    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    if (offer.requester_id !== user.id) return NextResponse.json({ error: "Only the requester can cancel" }, { status: 403 });
    if (offer.status !== "pending") return NextResponse.json({ error: `Offer already ${offer.status}` }, { status: 400 });

    await admin.from("rematch_offers").update({
      status: "cancelled",
      responded_at: new Date().toISOString(),
    }).eq("id", offerId);

    return NextResponse.json({ status: "cancelled" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
