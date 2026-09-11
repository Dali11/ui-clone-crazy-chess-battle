import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
      .select("id, sender_id, recipient_id, body, created_at, read_at, deleted_at")
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

    const { body: bodyRaw } = await req.json();
    const body = typeof bodyRaw === "string" ? bodyRaw.trim() : "";
    if (!body) return NextResponse.json({ error: "Empty message" }, { status: 400 });
    if (body.length > MAX_BODY)
      return NextResponse.json({ error: `Max ${MAX_BODY} characters` }, { status: 400 });
    const clean = body.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
    if (!clean) return NextResponse.json({ error: "Empty message" }, { status: 400 });

    const admin = createAdminClient();

    const { data: partner } = await admin.from("profiles").select("id").eq("id", partnerId).single();
    if (!partner) return NextResponse.json({ error: "User not found" }, { status: 404 });

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
      .insert({ sender_id: user.id, recipient_id: partnerId, body: clean })
      .select("id, sender_id, recipient_id, body, created_at, read_at, deleted_at")
      .single();
    if (error || !message) return NextResponse.json({ error: "Failed to send" }, { status: 500 });

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
