import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Poll a battle challenge's status (used by the challenger's waiting screen).
 * GET /api/battles/challenge/status?challengeId=...
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const challengeId = req.nextUrl.searchParams.get("challengeId");
    if (!challengeId) return NextResponse.json({ error: "Challenge ID required" }, { status: 400 });

    const admin = createAdminClient();
    const { data: challenge, error } = await admin
      .from("battle_challenges")
      .select("id, challenger_id, acceptor_id, status, battle_id, stake")
      .eq("id", challengeId)
      .single();

    if (error || !challenge) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (challenge.challenger_id !== user.id && challenge.acceptor_id !== user.id) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }

    return NextResponse.json({
      status: challenge.status,
      battleId: challenge.battle_id,
      stake: challenge.stake,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
