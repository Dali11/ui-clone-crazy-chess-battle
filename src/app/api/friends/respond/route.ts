import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/send";
import { rulesFromConfig } from "@/lib/push/rules";
import { getPlatformConfig } from "@/lib/platform-config";
import { friendAcceptedPayload } from "@/lib/push/rules";

export const dynamic = "force-dynamic";

/**
 * POST /api/friends/respond { requestId, action: 'accept' | 'decline' }
 * Only the addressee can respond.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { requestId, action } = await req.json();
    if (!requestId || (action !== "accept" && action !== "decline"))
      return NextResponse.json({ error: "requestId and action (accept|decline) required" }, { status: 400 });

    const admin = createAdminClient();
    const rules = rulesFromConfig((await getPlatformConfig(admin, "push").catch(() => null) as Record<string, any> | null) || null);
    const { data: rel } = await admin.from("friends").select("id, requester_id, addressee_id, status").eq("id", requestId).single();
    if (!rel) return NextResponse.json({ error: "Request not found" }, { status: 404 });
    if (rel.addressee_id !== user.id) return NextResponse.json({ error: "Not your request to answer" }, { status: 403 });
    if (rel.status !== "pending") return NextResponse.json({ error: "Already answered" }, { status: 400 });

    if (action === "decline") {
      // decline = delete the row (lets either side try again later)
      await admin.from("friends").delete().eq("id", rel.id);
      return NextResponse.json({ status: "declined" });
    }

    const { error: updErr } = await admin
      .from("friends")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", rel.id);
    if (updErr) return NextResponse.json({ error: "Failed to accept" }, { status: 500 });

    const { data: me } = await admin.from("profiles").select("username").eq("id", user.id).single();
    try {
      await admin.from("notifications").insert({
        user_id: rel.requester_id,
        type: "friend_accepted",
        title: "Friend request accepted 🎉",
        body: `${me?.username || "A player"} accepted your friend request — challenge them anytime!`,
        data: { userId: user.id },
        read: false,
      });
    } catch {}
    try {
      await sendPushToUsers(admin, [rel.requester_id], friendAcceptedPayload(me?.username || "", user.id),
          { notifKey: `friend-accepted:${user.id}:${rel.requester_id}`, gapMin: rules.dm_gap_min, rules });
    } catch {}

    return NextResponse.json({ status: "accepted" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
