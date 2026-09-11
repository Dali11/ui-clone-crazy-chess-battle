import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// GET /api/chats/unread — lightweight badge count: unread DMs only.
// (Group rooms have no per-user read state; a message arriving in a group
// the player already has open arrives via realtime anyway.)
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { count, error } = await admin
      .from("direct_messages")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .is("read_at", null)
      .is("deleted_at", null);

    if (error) return NextResponse.json({ error: "Server error" }, { status: 500 });
    return NextResponse.json({ unread: count || 0 });
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
