import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    // Fix: column is "player_id", not "user_id"
    const { error } = await admin
      .from("matchmaking_queue")
      .delete()
      .eq("player_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Cancel any auto-posted announce challenge links — the search is over.
    // (Manual challenge links are untouched.)
    await admin
      .from("challenges")
      .update({ status: "cancelled" })
      .eq("challenger_id", user.id)
      .eq("source", "quick_match_announce")
      .eq("status", "pending");

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to leave matchmaking" },
      { status: 500 }
    );
  }
}
