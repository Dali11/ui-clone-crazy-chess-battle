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
      .select("id, opponent_id, requester_id, status")
      .eq("id", offerId)
      .single();

    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });
    if (offer.opponent_id !== user.id) return NextResponse.json({ error: "Only the opponent can decline" }, { status: 403 });
    if (offer.status !== "pending") return NextResponse.json({ error: `Offer already ${offer.status}` }, { status: 400 });

    await admin.from("rematch_offers").update({
      status: "declined",
      responded_at: new Date().toISOString(),
    }).eq("id", offerId);

    // Notify the requester
    await admin.from("notifications").insert({
      user_id: offer.requester_id,
      type: "rematch_declined",
      title: "Rematch declined",
      body: "Your opponent declined the rematch offer.",
      data: { offerId },
      read: false,
    });

    return NextResponse.json({ status: "declined" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
