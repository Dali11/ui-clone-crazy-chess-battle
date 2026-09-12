import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/send";
import { dmPayload } from "@/lib/push/rules";
import { getPlatformConfig } from "@/lib/platform-config";

export const dynamic = "force-dynamic";

const MAX_RECIPIENTS = 20;

/**
 * POST /api/battles/challenge/invite { challengeId, userIds }
 * Bulk-send the challenge link as a DM to selected past opponents.
 * Only the challenge owner can send, and only while the challenge is pending.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { challengeId, userIds } = await req.json();
    if (!challengeId || !Array.isArray(userIds) || userIds.length === 0)
      return NextResponse.json({ error: "Challenge ID and recipients required" }, { status: 400 });

    const uniqueIds = [...new Set(userIds.filter((id: string) => typeof id === "string" && id !== user.id))];
    if (uniqueIds.length === 0)
      return NextResponse.json({ error: "No valid recipients" }, { status: 400 });
    if (uniqueIds.length > MAX_RECIPIENTS)
      return NextResponse.json({ error: `Max ${MAX_RECIPIENTS} recipients per invite` }, { status: 400 });

    const admin = createAdminClient();

    const { data: challenge } = await admin
      .from("battle_challenges")
      .select("id, challenger_id, status, expires_at")
      .eq("id", challengeId)
      .single();
    if (!challenge || challenge.challenger_id !== user.id)
      return NextResponse.json({ error: "Not your challenge" }, { status: 403 });
    if (challenge.status !== "pending")
      return NextResponse.json({ error: "Challenge is no longer pending" }, { status: 400 });
    if (challenge.expires_at && new Date(challenge.expires_at).getTime() <= Date.now())
      return NextResponse.json({ error: "Challenge has expired" }, { status: 400 });

    const { data: me } = await admin
      .from("profiles")
      .select("id, username, is_banned")
      .eq("id", user.id)
      .single();
    if (!me || me.is_banned) return NextResponse.json({ error: "Account not allowed" }, { status: 403 });

    // Recipients must exist and not be banned
    const { data: recipients } = await admin
      .from("profiles")
      .select("id")
      .in("id", uniqueIds)
      .eq("is_banned", false);
    if (!recipients || recipients.length === 0)
      return NextResponse.json({ error: "No valid recipients" }, { status: 400 });

    // Already invited for this challenge? Skip those instead of double-DMing.
    const { data: invitedRows } = await admin
      .from("direct_messages")
      .select("recipient_id")
      .eq("sender_id", user.id)
      .like("body", `%/battle-challenge/${challengeId}%`)
      .in("recipient_id", recipients.map((r) => r.id));
    const alreadyInvited = new Set((invitedRows ?? []).map((r) => r.recipient_id));
    const toInvite = recipients.filter((r) => !alreadyInvited.has(r.id));
    if (toInvite.length === 0)
      return NextResponse.json({ sent: 0, skipped: recipients.length, message: "Already invited everyone selected" });

    // Build the link from the request origin — never trust a client-supplied URL
    const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
      req.nextUrl.origin.replace(/\/$/, "");
    const link = `${origin}/battle-challenge/${challengeId}`;
    const body = `⚔️ ${me.username || "A player"} challenges you to a chess battle! Tap to see the stake and accept: ${link}`;

    const rows = toInvite.map((r) => ({
      sender_id: user.id,
      recipient_id: r.id,
      body,
    }));
    const { error: insertError } = await admin.from("direct_messages").insert(rows);
    if (insertError) return NextResponse.json({ error: "Failed to send invites" }, { status: 500 });

    // Push notification to each recipient (never blocks the result)
    try {
      const { rulesFromConfig } = await import("@/lib/push/rules");
      let rules = rulesFromConfig(null);
      try { rules = rulesFromConfig(await getPlatformConfig(admin, "push")); } catch {}
      const fromName = me.username || "A player";
      const preview = "⚔️ Battle challenge — tap to see the stake and accept";
      await Promise.all(toInvite.map((r) =>
        sendPushToUsers(admin, [r.id], dmPayload(fromName, preview, user.id),
          { notifKey: `dm:${user.id}:${r.id}`, gapMin: rules.dm_gap_min, rules }).catch(() => {})
      ));
    } catch {}

    return NextResponse.json({
      sent: toInvite.length,
      skipped: recipients.length - toInvite.length,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
