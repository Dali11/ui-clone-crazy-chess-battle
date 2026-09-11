import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_BODY = 500;          // WhatsApp-ish message cap
const RATE_LIMIT_MS = 2500;    // min gap between a user's messages
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
      .select("id, room, user_id, username, avatar_url, body, created_at, deleted_at")
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

    const { room: roomRaw, body: bodyRaw } = await req.json();
    const room = typeof roomRaw === "string" && roomRaw.trim() ? roomRaw.trim() : "malawi";
    const body = typeof bodyRaw === "string" ? bodyRaw.trim() : "";
    if (!body) return NextResponse.json({ error: "Empty message" }, { status: 400 });
    if (body.length > MAX_BODY)
      return NextResponse.json({ error: `Max ${MAX_BODY} characters` }, { status: 400 });
    // Strip control characters (keeps emoji, strips newlines-injected junk —
    // chat is single-line)
    const clean = body.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (!clean) return NextResponse.json({ error: "Empty message" }, { status: 400 });

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

    const { data: message, error } = await admin
      .from("community_messages")
      .insert({
        room,
        user_id: user.id,
        username: profile?.username || "player",
        avatar_url: profile?.avatar_url || null,
        body: clean,
      })
      .select("id, room, user_id, username, avatar_url, body, created_at, deleted_at")
      .single();
    if (error || !message) return NextResponse.json({ error: "Failed to send" }, { status: 500 });

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
