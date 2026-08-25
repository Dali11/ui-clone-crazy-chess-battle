import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  try {
    const { challengeId } = await request.json();
    if (!challengeId) return NextResponse.json({ error: "Missing challengeId" }, { status: 400 });

    const admin = createAdminClient();
    const { data: challenge, error } = await admin
      .from("draughts_challenges")
      .select("status, game_id")
      .eq("id", challengeId)
      .single();

    if (error || !challenge) return NextResponse.json({ error: "Challenge not found" }, { status: 404 });

    return NextResponse.json({ status: challenge.status, gameId: challenge.game_id });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
