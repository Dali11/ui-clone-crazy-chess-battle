import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/send";
import { getPlatformConfig } from "@/lib/platform-config";

export const dynamic = "force-dynamic";

const MAX_BODY = 500;
const RATE_LIMIT_MS = 2500;
const PAGE_SIZE = 50;

// GET /api/chats/dm/[userId]?before=<id> — the DM thread with that user
export async function GET(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId: partnerId } = await ctx.params;
    const admin = createAdminClient();

    // Partner must exist
    const { data: partner } = await admin
      .from("profiles")
      .select("id, username, avatar_url")
      .eq("id", partnerId)
      .single();
    if (!partner) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const beforeRaw = req.nextUrl.searchParams.get("before");
    const before = beforeRaw ? Number(beforeRaw) : null;

    let query = admin
      .from("direct_messages")
      .select("id, sender_id, recipient_id, body, created_at, read_at, deleted_at, audio_url, audio_duration, image_url, reply_to_id, reply_username, reply_preview")
      .or(`and(sender_id.eq.${user.id},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${user.id})`)
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);
    if (before && Number.isFinite(before)) query = query.lt("id", before);

    const { data: rows, error } = await query;
    if (error) return NextResponse.json({ error: "Failed to load" }, { status: 500 });

    return NextResponse.json({
      partner,
      messages: (rows || []).reverse(),
      hasMore: (rows || []).length === PAGE_SIZE,
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/chats/dm/[userId] { body } — send a DM
export async function POST(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId: partnerId } = await ctx.params;
    if (partnerId === user.id)
      return NextResponse.json({ error: "Can't message yourself" }, { status: 400 });

    const { body: bodyRaw, audioUrl, audioDuration, imageUrl, replyToId } = await req.json();
    const body = typeof bodyRaw === "string" ? bodyRaw.trim() : "";
    const audio = typeof audioUrl === "string" ? audioUrl.trim() : "";
    const image = typeof imageUrl === "string" ? imageUrl.trim() : "";
    const dur = Number.isFinite(audioDuration) ? Math.min(Math.max(Math.round(audioDuration), 0), 300) : null;
    if (audio && !audio.startsWith(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/chat-voice/`))
      return NextResponse.json({ error: "Invalid audio" }, { status: 400 });
    if (image && !image.startsWith(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/chat-images/`))
      return NextResponse.json({ error: "Invalid image" }, { status: 400 });
    if (!body && !audio && !image) return NextResponse.json({ error: "Empty message" }, { status: 400 });
    if (body.length > MAX_BODY)
      return NextResponse.json({ error: `Max ${MAX_BODY} characters` }, { status: 400 });
    const clean = body.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (!clean && !audio && !image) return NextResponse.json({ error: "Empty message" }, { status: 400 });

    const admin = createAdminClient();

    const { data: partner } = await admin.from("profiles").select("id").eq("id", partnerId).single();
    if (!partner) return NextResponse.json({ error: "User not found" }, { status: 404 });
    const { data: senderProfile } = await admin.from("profiles").select("username").eq("id", user.id).single();

    // Quoted reply: the original must belong to this same conversation
    // (either direction) and not be deleted. Snapshot username + preview.
    let reply = null;
    if (replyToId && (typeof replyToId === "string" || typeof replyToId === "number")) {
      const { data: orig } = await admin
        .from("direct_messages")
        .select("id, sender_id, recipient_id, body, audio_url, image_url, deleted_at")
        .eq("id", replyToId)
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${user.id})`)
        .is("deleted_at", null)
        .single();
      if (orig) {
        const { data: origSender } = await admin.from("profiles").select("username").eq("id", orig.sender_id).single();
        const preview = orig.body ? orig.body.slice(0, 120) : (orig.image_url ? "📷 Photo" : orig.audio_url ? "🎤 Voice note" : "Message");
        reply = { id: orig.id, username: origSender?.username || "player", preview };
      }
    }

    // Rate limit: one message per RATE_LIMIT_MS per sender
    const since = new Date(Date.now() - RATE_LIMIT_MS).toISOString();
    const { data: recent } = await admin
      .from("direct_messages")
      .select("id")
      .eq("sender_id", user.id)
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length > 0)
      return NextResponse.json({ error: "Sending too fast — wait a moment" }, { status: 429 });

    const { data: message, error } = await admin
      .from("direct_messages")
      .insert({ sender_id: user.id, recipient_id: partnerId, body: clean, audio_url: audio || null, audio_duration: audio ? dur : null, image_url: image || null,
        reply_to_id: reply?.id || null, reply_username: reply?.username || null, reply_preview: reply?.preview || null })
      .select("id, sender_id, recipient_id, body, created_at, read_at, deleted_at, audio_url, audio_duration, image_url, reply_to_id, reply_username, reply_preview")
      .single();
    if (error || !message) return NextResponse.json({ error: "Failed to send" }, { status: 500 });

    // Push notification to the recipient (WhatsApp-style). Never blocks the send.
    try {
      const { dmPayload, rulesFromConfig } = await import("@/lib/push/rules");
      let rules = rulesFromConfig(null);
      try { rules = rulesFromConfig(await getPlatformConfig(admin, "push")); } catch {}
      await sendPushToUsers(admin, [partnerId],
        dmPayload(senderProfile?.username || "A player", clean || (message.audio_url ? "🎤 Voice note" : "📷 Photo"), user.id),
        { notifKey: `dm:${user.id}:${partnerId}`, gapMin: rules.dm_gap_min, rules });
    } catch {}

    return NextResponse.json({ message });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH /api/chats/dm/[userId] — mark all of the partner's messages to me as read
export async function PATCH(_req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId: partnerId } = await ctx.params;
    const admin = createAdminClient();

    const { error } = await admin
      .from("direct_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("sender_id", partnerId)
      .eq("recipient_id", user.id)
      .is("read_at", null);
    if (error) return NextResponse.json({ error: "Failed" }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/chats/dm/[userId]?id=<id> — soft delete (either participant)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const admin = createAdminClient();
    const { data: message } = await admin
      .from("direct_messages")
      .select("id, sender_id, recipient_id")
      .eq("id", id)
      .single();
    if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const participant = message.sender_id === user.id || message.recipient_id === user.id;
    if (!participant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error } = await admin
      .from("direct_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);
    if (error) return NextResponse.json({ error: "Failed to delete" }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
