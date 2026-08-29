import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST — updates the spectator_count for a game.
 * Called from the client-side realtime hook when presence changes.
 * Uses the admin client server-side only (never expose service role key to browser).
 * Best-effort — silently no-ops if the column doesn't exist yet (pre-migration).
 */
export async function POST(req: NextRequest) {
  try {
    const { gameId, count } = await req.json();
    if (!gameId || typeof count !== "number") {
      return NextResponse.json({ error: "Missing gameId or count" }, { status: 400 });
    }

    const admin = createAdminClient();
    await admin.from("games").update({ spectator_count: count }).eq("id", gameId);

    return NextResponse.json({ success: true });
  } catch {
    // Best-effort — never let this break the client (e.g. column not migrated yet)
    return NextResponse.json({ success: false });
  }
}
