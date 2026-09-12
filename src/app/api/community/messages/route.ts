import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/send";
import { getPlatformConfig } from "@/lib/platform-config";

export const dynamic = "force-dynamic";

const MAX_BODY = 500;          // WhatsApp-ish message cap
const RATE_LIMIT_MS = 2500;

export const maxDuration = 60;    // min gap between a user's messages
const PAGE_SIZE = 50;

// GET /api/community/messages?room=malawi&before=<id>
// Returns up to PAGE_SIZE messages in ASCENDING order (newest last) for
// simple append; `before` pages older history for infinite scroll up.
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const room = req.nextUrl.searchParams.get("room") || "malawi";
    const beforeRaw = req.nextUrl.searchParams.get("before");
    const before = beforeRaw ? Number(beforeRaw) : null;
    const admin = createAdminClient();

    // Country gate: global rooms are for everyone; country rooms only
    // for players from that country.
    const { data: roomRow } = await admin.from("community_rooms").select("id, country").eq("id", room).single();
    if (!roomRow) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    if (roomRow.country) {
      const { data: me } = await admin.from("profiles").select("country").eq("id", user.id).single();
      if (me?.country !== roomRow.country)
        return NextResponse.json({ error: "This room isn't available in your country" }, { status: 403 });
    }

    let query = admin
      .from("community_messages")
      .select("id, room, user_id, username, avatar_url, body, created_at, deleted_at, audio_url, audio_duration, image_url, reply_to_id, reply_username, reply_preview")
      .eq("room", room)
      .order("id", { ascending: false })
      .limit(PAGE_SIZE);
    if (before && Number.isFinite(before)) query = query.lt("id", before);

    const { data: rows, error } = await query;
    if (error) return NextResponse.json({ error: "Failed to load" }, { status: 500 });

    const messages = (rows || []).reverse(); // ascending, newest last
    const hasMore = (rows || []).length === PAGE_SIZE;
    return NextResponse.json({ messages, hasMore });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/community/messages { room, body }
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { room: roomRaw, body: bodyRaw, audioUrl, audioDuration, imageUrl, replyToId } = await req.json();
    const room = typeof roomRaw === "string" && roomRaw.trim() ? roomRaw.trim() : "malawi";
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
    // Strip control characters (keeps emoji, strips newlines-injected junk —
    // chat is single-line)
    const clean = body.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (!clean && !audio && !image) return NextResponse.json({ error: "Empty message" }, { status: 400 });

    const admin = createAdminClient();

    // Country gate (same as GET)
    const { data: roomRow } = await admin.from("community_rooms").select("id, country").eq("id", room).single();
    if (!roomRow) return NextResponse.json({ error: "Room not found" }, { status: 404 });
    if (roomRow.country) {
      const { data: me } = await admin.from("profiles").select("country").eq("id", user.id).single();
      if (me?.country !== roomRow.country)
        return NextResponse.json({ error: "This room isn't available in your country" }, { status: 403 });
    }

    // Rate limit: one message per RATE_LIMIT_MS per user
    const since = new Date(Date.now() - RATE_LIMIT_MS).toISOString();
    const { data: recent } = await admin
      .from("community_messages")
      .select("id")
      .eq("user_id", user.id)
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length > 0)
      return NextResponse.json({ error: "Sending too fast — wait a moment" }, { status: 429 });

    const { data: profile } = await admin
      .from("profiles")
      .select("username, avatar_url")
      .eq("id", user.id)
      .single();

    // Quoted reply: the original must be in the same room (and not
    // deleted). Snapshot username + preview so the quote survives the
    // original scrolling out of the loaded window or being deleted.
    let reply = null;
    if (replyToId && (typeof replyToId === "string" || typeof replyToId === "number")) {
      const { data: orig } = await admin
        .from("community_messages")
        .select("id, username, body, audio_url, image_url, deleted_at")
        .eq("id", replyToId)
        .eq("room", room)
        .is("deleted_at", null)
        .single();
      if (orig) {
        const preview = orig.body ? orig.body.slice(0, 120) : (orig.image_url ? "📷 Photo" : orig.audio_url ? "🎤 Voice note" : "Message");
        reply = { id: orig.id, username: orig.username || "player", preview };
      }
    }

    const { data: message, error } = await admin
      .from("community_messages")
      .insert({
        room,
        user_id: user.id,
        username: profile?.username || "player",
        avatar_url: profile?.avatar_url || null,
        body: clean,
        audio_url: audio || null,
        audio_duration: audio ? dur : null,
        image_url: image || null,
        reply_to_id: reply?.id || null,
        reply_username: reply?.username || null,
        reply_preview: reply?.preview || null,
      })
      .select("id, room, user_id, username, avatar_url, body, created_at, deleted_at, audio_url, audio_duration, image_url, reply_to_id, reply_username, reply_preview")
      .single();
    if (error || !message) return NextResponse.json({ error: "Failed to send" }, { status: 500 });

    // Push notification to subscribed players who can see this room
    // (same country, or everyone for the global room) — throttled to at
    // most one per room per player per group_gap_min so chatty rooms
    // don't spam. Never blocks or fails the send.
    try {
      let targets: string[] = [];
      if (roomRow.country) {
        const { data: locals } = await admin.from("profiles").select("id").eq("country", roomRow.country);
        targets = (locals || []).map((r: any) => r.id);
      } else {
        const { data: subs } = await admin.from("push_subscriptions").select("user_id");
        targets = Array.from(new Set((subs || []).map((r: any) => r.user_id)));
      }
      targets = targets.filter((id) => id !== user.id);
      if (targets.length) {
        const { groupPayload, rulesFromConfig } = await import("@/lib/push/rules");
        let rules = rulesFromConfig(null);
        try { rules = rulesFromConfig(await getPlatformConfig(admin, "push")); } catch {}
        await sendPushToUsers(admin, targets,
          groupPayload(room, profile?.username || "Someone", clean || (message.audio_url ? "🎤 Voice note" : "📷 Photo")),
          { notifKey: `group:${room}`, gapMin: rules.group_gap_min, rules });
      }
    } catch {}

    return NextResponse.json({ message });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE /api/community/messages?id=<id> — soft delete; own message or admin
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = Number(req.nextUrl.searchParams.get("id"));
    if (!Number.isFinite(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    const { data: message } = await admin
      .from("community_messages")
      .select("id, user_id")
      .eq("id", id)
      .single();
    if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const canDelete = message.user_id === user.id || profile?.is_admin === true;
    if (!canDelete) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error } = await admin
      .from("community_messages")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .is("deleted_at", null);
    if (error) return NextResponse.json({ error: "Failed to delete" }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
