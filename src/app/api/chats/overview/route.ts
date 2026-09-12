import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// GET /api/chats/overview
// The Chats list page: visible rooms (global + player's country) and DM
// conversations with last message + unread counts.
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("country")
      .eq("id", user.id)
      .single();
    const myCountry = profile?.country || null;

    // ── Groups: global + my country ──────────────────────────────
    let roomsQuery = admin.from("community_rooms").select("id, name, country, image_url").order("id");
    const { data: rooms } = myCountry
      ? await roomsQuery.or(`country.is.null,country.eq.${myCountry}`)
      : await roomsQuery.is("country", null);

    const groups = [];
    for (const r of rooms || []) {
      const { data: last } = await admin
        .from("community_messages")
        .select("body, deleted_at, created_at, username, audio_url, image_url")
        .eq("room", r.id)
        .order("id", { ascending: false })
        .limit(1);
      groups.push({
        id: r.id,
        name: r.name,
        country: r.country,
        imageUrl: r.image_url,
        lastBody: last?.[0]?.body || null,
        lastVoice: !!last?.[0]?.audio_url,
        lastImage: !!last?.[0]?.image_url,
        lastDeleted: !!last?.[0]?.deleted_at,
        lastAt: last?.[0]?.created_at || null,
      });
    }

    // ── DM conversations (recent window, grouped by partner) ───────
    const { data: myDms } = await admin
      .from("direct_messages")
      .select("id, sender_id, recipient_id, body, created_at, read_at, deleted_at, audio_url, image_url")
      .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
      .order("id", { ascending: false })
      .limit(300);

    const byPartner = new Map<string, { last: any; unread: number }>();
    for (const dm of myDms || []) {
      const partnerId = dm.sender_id === user.id ? dm.recipient_id : dm.sender_id;
      const entry = byPartner.get(partnerId);
      if (!entry) {
        byPartner.set(partnerId, {
          last: dm,
          unread: dm.recipient_id === user.id && !dm.read_at && !dm.deleted_at ? 1 : 0,
        });
      } else if (dm.recipient_id === user.id && !dm.read_at && !dm.deleted_at) {
        entry.unread += 1;
      }
    }

    // Partner profiles in one query
    const partnerIds = [...byPartner.keys()];
    const partners = partnerIds.length
      ? (await admin.from("profiles").select("id, username, avatar_url").in("id", partnerIds)).data || []
      : [];
    const partnerMap = new Map(partners.map((p: any) => [p.id, p]));

    const conversations = [...byPartner.entries()].map(([partnerId, { last, unread }]) => ({
      partnerId,
      username: partnerMap.get(partnerId)?.username || "player",
      avatarUrl: partnerMap.get(partnerId)?.avatar_url || null,
      lastBody: last.deleted_at ? null : last.body,
      lastVoice: !last.deleted_at && !!last.audio_url,
      lastImage: !last.deleted_at && !!last.image_url,
      lastDeleted: !!last.deleted_at,
      lastMine: last.sender_id === user.id,
      lastAt: last.created_at,
      unread,
    }));

    // Most recent first
    conversations.sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));

    return NextResponse.json({ groups, conversations });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
