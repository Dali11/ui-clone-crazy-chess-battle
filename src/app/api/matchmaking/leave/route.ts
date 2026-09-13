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

    // The announce link SURVIVES the search ending. Players who see the
    // room post / push notification can still tap in for the full 10-minute
    // link window — the challenge expires on its own at expires_at (the
    // cleanup cron sweeps it), or cancels when the challenger starts another
    // game. Killing it here made every link "expire" the second the 60s
    // search ended, which is exactly what players complained about.
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to leave matchmaking" },
      { status: 500 }
    );
  }
}
