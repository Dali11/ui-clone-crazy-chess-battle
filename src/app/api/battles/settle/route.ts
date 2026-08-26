import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";
import { settleBattle } from "@/lib/battles/settle";

/**
 * Settle a battle — pays out the winner, takes platform fee.
 * Called server-side after a game ends (from game resign/timeout/move API).
 * Body: { battleId: string, winnerId: string | null, result: string }
 * winnerId null = draw (triggers armageddon)
 *
 * Authentication: the caller must be authenticated AND be a participant in the
 * battle (white or black player). This prevents anyone from triggering
 * arbitrary battle settlements.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { battleId, winnerId, result } = await req.json();
    if (!battleId) return NextResponse.json({ error: "Battle ID required" }, { status: 400 });

    // Verify the caller is a participant in this battle
    const admin = createAdminClient();
    const { data: battle } = await admin
      .from("battles")
      .select("white_player_id, black_player_id")
      .eq("id", battleId)
      .single();

    if (!battle) return NextResponse.json({ error: "Battle not found" }, { status: 404 });

    if (battle.white_player_id !== user.id && battle.black_player_id !== user.id) {
      return NextResponse.json({ error: "Not a battle participant" }, { status: 403 });
    }

    const outcome = await settleBattle(battleId, winnerId, result);
    return NextResponse.json(outcome);
  } catch (e: any) {
    console.error("Battle settlement error:", e);
    return NextResponse.json({ error: e.message || "Settlement failed" }, { status: 500 });
  }
}

/**
 * Called by cron to auto-settle battles where a player timed out or disconnected.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Find battles with ended games that haven't been settled
  const { data: activeBattles } = await admin
    .from("battles")
    .select(`
      id, game_id, armageddon_game_id, status, white_player_id, black_player_id, armageddon_round
    `)
    .in("status", ["playing", "draw_armageddon"]);

  if (!activeBattles || activeBattles.length === 0) {
    return NextResponse.json({ checked: 0, settled: 0 });
  }

  let settled = 0;
  for (const battle of activeBattles) {
    const gameId = battle.armageddon_game_id || battle.game_id;
    if (!gameId) continue;

    const { data: game } = await admin
      .from("games")
      .select("status, winner")
      .eq("id", gameId)
      .single();

    if (!game || game.status === "playing") continue;

    // Game is over — determine winner
    let winnerId: string | null = null;
    if (game.winner === "white") {
      winnerId = battle.armageddon_game_id ? battle.black_player_id : battle.white_player_id;
    } else if (game.winner === "black") {
      winnerId = battle.armageddon_game_id ? battle.white_player_id : battle.black_player_id;
    }

    // Settle directly using the shared function (no HTTP self-fetch)
    try {
      await settleBattle(battle.id, winnerId, game.status);
      settled++;
    } catch (e) {
      console.error("Auto-settle failed for battle", battle.id, e);
    }
  }

  return NextResponse.json({ checked: activeBattles.length, settled });
}
