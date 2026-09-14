import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/friends
 * { friends: [...accepted, newest first], incoming: [...pending for me], outgoing: [...pending from me] }
 * Each row carries the OTHER user's profile (id, username, display_name, avatar_url, rating).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: rows, error } = await admin
      .from("friends")
      .select("id, requester_id, addressee_id, status, created_at, responded_at")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    if (error) return NextResponse.json({ error: "Failed to load friends" }, { status: 500 });

    const list = rows || [];
    const otherIds = [...new Set(list.map((r) => (r.requester_id === user.id ? r.addressee_id : r.requester_id)))];

    const { data: profiles } = otherIds.length
      ? await admin
          .from("profiles")
          .select("id, username, display_name, avatar_url, rating, is_banned")
          .in("id", otherIds)
      : { data: [] };
    const byId = new Map((profiles || []).map((p) => [p.id, p]));

    const decorate = (r: any) => {
      const otherId = r.requester_id === user.id ? r.addressee_id : r.requester_id;
      const p = byId.get(otherId);
      return {
        id: r.id,
        status: r.status,
        createdAt: r.created_at,
        // who sent it (so the UI knows direction without recomputing)
        direction: r.requester_id === user.id ? "outgoing" : "incoming",
        user: p
          ? { id: p.id, username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url, rating: p.rating }
          : null,
      };
    };

    const friends = list.filter((r) => r.status === "accepted").map(decorate);
    const incoming = list.filter((r) => r.status === "pending" && r.addressee_id === user.id).map(decorate);
    const outgoing = list.filter((r) => r.status === "pending" && r.requester_id === user.id).map(decorate);

    // hide banned users entirely
    const clean = (arr: any[]) => arr.filter((x) => x.user);
    return NextResponse.json({
      friends: clean(friends),
      incoming: clean(incoming),
      outgoing: clean(outgoing),
    });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
