import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/friends/remove { userId }
 * Unfriend or cancel an outgoing request — deletes the row either direction.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { userId } = await req.json();
    if (!userId) return NextResponse.json({ error: "User ID required" }, { status: 400 });

    const admin = createAdminClient();
    const { error } = await admin
      .from("friends")
      .delete()
      .or(`and(requester_id.eq.${user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${user.id})`);
    if (error) return NextResponse.json({ error: "Failed to remove" }, { status: 500 });

    return NextResponse.json({ removed: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
