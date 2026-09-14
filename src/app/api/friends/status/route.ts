import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/friends/status?userId=...
 * Button state for one relationship: 'none' | 'pending_out' | 'pending_in' | 'accepted' | 'self'
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });
    if (userId === user.id) return NextResponse.json({ status: "self" });

    const admin = createAdminClient();
    const { data: rel } = await admin
      .from("friends")
      .select("status, requester_id, addressee_id")
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`)
      .limit(1);

    const row = rel?.[0];
    if (!row) return NextResponse.json({ status: "none" });
    if (row.status === "accepted") return NextResponse.json({ status: "accepted" });
    if (row.status === "pending")
      return NextResponse.json({ status: row.requester_id === user.id ? "pending_out" : "pending_in" });
    return NextResponse.json({ status: "none" }); // declined row deleted on decline
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
