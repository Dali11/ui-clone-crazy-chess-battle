import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/send";
import { rulesFromConfig } from "@/lib/push/rules";
import { getPlatformConfig } from "@/lib/platform-config";
import { dmPayload } from "@/lib/push/rules";

export const dynamic = "force-dynamic";

const TC_MAP: Record<string, { minutes: number; increment: number; label: string }> = {
  bullet: { minutes: 1, increment: 0, label: "Bullet" },
  blitz: { minutes: 3, increment: 2, label: "Blitz" },
  rapid: { minutes: 10, increment: 0, label: "Rapid" },
  classical: { minutes: 30, increment: 0, label: "Classical" },
};

/**
 * POST /api/friends/challenge { friendId, timeControl, rated }
 * One-tap free challenge to an ACCEPTED friend: creates a pending
 * challenge row, DMs the link, drops an in-app notification + push.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { friendId, timeControl, rated } = await req.json();
    if (!friendId) return NextResponse.json({ error: "friendId required" }, { status: 400 });
    const tc = TC_MAP[timeControl] || TC_MAP.rapid;

    const admin = createAdminClient();
    const rules = rulesFromConfig((await getPlatformConfig(admin, "push").catch(() => null) as Record<string, any> | null) || null);

    const { data: me } = await admin.from("profiles").select("id, username, is_banned").eq("id", user.id).single();
    if (!me || me.is_banned) return NextResponse.json({ error: "Account not allowed" }, { status: 403 });

    // must be accepted friends
    const { data: rel } = await admin
      .from("friends")
      .select("id")
      .eq("status", "accepted")
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${friendId}),and(requester_id.eq.${friendId},addressee_id.eq.${user.id})`)
      .limit(1);
    if (!rel?.length) return NextResponse.json({ error: "You can only challenge friends" }, { status: 403 });

    const { data: friend } = await admin.from("profiles").select("id, username, is_banned").eq("id", friendId).single();
    if (!friend || friend.is_banned) return NextResponse.json({ error: "Friend not available" }, { status: 403 });

    // Create the free challenge (same shape as /api/challenge/create)
    const { data: challenge, error: createErr } = await admin
      .from("challenges")
      .insert({
        challenger_id: user.id,
        time_control: tc === TC_MAP.bullet ? "bullet" : tc === TC_MAP.blitz ? "blitz" : tc === TC_MAP.rapid ? "rapid" : "classical",
        initial_minutes: tc.minutes,
        increment_seconds: tc.increment,
        rated: rated ?? true,
        color: "random",
        status: "pending",
        source: "friend",
        expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2h window
      })
      .select("id")
      .single();
    if (createErr || !challenge) return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });

    // DM the link (server-built, never client-supplied)
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || req.nextUrl.origin.replace(/\/$/, "");
    const link = `${origin}/challenge/${challenge.id}`;
    const body = `♟️ ${me.username || "Your friend"} challenges you to a ${tc.label} game! Accept here:\n${link}`;
    const { error: dmErr } = await admin.from("direct_messages").insert({
      sender_id: user.id,
      recipient_id: friendId,
      body,
    });
    if (dmErr) return NextResponse.json({ error: "Failed to send challenge" }, { status: 500 });

    // in-app notification + push (best-effort)
    try {
      await admin.from("notifications").insert({
        user_id: friendId,
        type: "challenge_received",
        title: `${me.username || "A friend"} challenged you to a game!`,
        body: `${me.username || "Your friend"} challenged you to a ${tc.label} game.`,
        data: { challengerName: me.username, challengerRating: 0, timeControl: tc.label, challengeId: challenge.id },
        read: false,
      });
    } catch {}
    try {
      await sendPushToUsers(admin, [friendId], {
        title: "New challenge! ♟️",
        body: `${me.username || "A friend"} challenged you to a ${tc.label} game`,
        url: `/challenge/${challenge.id}`,
        tag: `friend-challenge-${user.id}`,
      }, { notifKey: `friend-challenge:${user.id}:${friendId}`, gapMin: rules.dm_gap_min, rules });
    } catch {}

    return NextResponse.json({ challengeId: challenge.id, url: link });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
