import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/send";
import { rulesFromConfig } from "@/lib/push/rules";
import { getPlatformConfig } from "@/lib/platform-config";
import { friendRequestPayload } from "@/lib/push/rules";

export const dynamic = "force-dynamic";

/**
 * POST /api/friends/request { userId }
 * Send a friend request. No dupes (either direction), no self, no banned.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId } = await req.json();
    if (!userId || typeof userId !== "string")
      return NextResponse.json({ error: "User ID required" }, { status: 400 });
    if (userId === user.id)
      return NextResponse.json({ error: "You can't friend yourself" }, { status: 400 });

    const admin = createAdminClient();
    const rules = rulesFromConfig((await getPlatformConfig(admin, "push").catch(() => null) as Record<string, any> | null) || null);

    const { data: me } = await admin.from("profiles").select("id, username, is_banned").eq("id", user.id).single();
    if (!me || me.is_banned) return NextResponse.json({ error: "Account not allowed" }, { status: 403 });

    const { data: target } = await admin.from("profiles").select("id, username, is_banned").eq("id", userId).single();
    if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (target.is_banned) return NextResponse.json({ error: "User not available" }, { status: 403 });

    // Existing relationship in either direction?
    const { data: existing } = await admin
      .from("friends")
      .select("id, status, requester_id, addressee_id")
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`)
      .limit(1);
    const rel = existing?.[0];
    if (rel) {
      if (rel.status === "accepted") return NextResponse.json({ status: "accepted", message: "Already friends" });
      if (rel.status === "pending" && rel.requester_id === userId) {
        // they already sent US a request — auto-accept instead of a dangling pair
        const { error: updErr } = await admin
          .from("friends")
          .update({ status: "accepted", responded_at: new Date().toISOString() })
          .eq("id", rel.id);
        if (updErr) return NextResponse.json({ error: "Failed to accept" }, { status: 500 });
        try {
          await sendPushToUsers(admin, [userId], friendRequestPayload(me.username, user.id),
          { notifKey: `friend-request:${user.id}:${userId}`, gapMin: rules.dm_gap_min, rules });
        } catch {}
        await admin.from("notifications").insert({
          user_id: userId,
          type: "friend_accepted",
          title: "Friend request accepted 🎉",
          body: `${me.username || "A player"} accepted your friend request`,
          data: { userId: user.id },
          read: false,
        });
        return NextResponse.json({ status: "accepted", message: "You are now friends" });
      }
      if (rel.status === "pending") return NextResponse.json({ status: "pending_out", message: "Request already sent" });
      // declined before — allow a fresh request (delete old row, insert new)
      await admin.from("friends").delete().eq("id", rel.id);
    }

    const { data: inserted, error: insertErr } = await admin
      .from("friends")
      .insert({ requester_id: user.id, addressee_id: userId, status: "pending" })
      .select("id")
      .single();
    if (insertErr || !inserted) return NextResponse.json({ error: "Failed to send request" }, { status: 500 });
    const requestId = inserted.id;

    // in-app notification + push (best-effort, never blocks)
    try {
      await admin.from("notifications").insert({
        user_id: userId,
        type: "friend_request",
        title: "New friend request 👥",
        body: `${me.username || "A player"} wants to be your friend`,
        data: { userId: user.id, requestId },
        read: false,
      });
    } catch {}
    try {
      await sendPushToUsers(admin, [userId], friendRequestPayload(me.username, user.id),
          { notifKey: `friend-request:${user.id}:${userId}`, gapMin: rules.dm_gap_min, rules });
    } catch {}

    return NextResponse.json({ status: "pending_out", message: "Friend request sent" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
