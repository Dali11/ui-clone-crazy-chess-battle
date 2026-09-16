import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { settleBattle } from "@/lib/battles/settle";

/**
 * Settle battles whose games have ended.
 *
 * SECURITY FIX 2026-09-16 (CRITICAL): this route previously exposed a POST
 * handler that authenticated the caller and checked they were a battle
 * participant, but then passed the CLIENT-SUPPLIED winnerId/result straight
 * into settleBattle() — which only validates that winnerId is one of the two
 * participants, never that the game ended or who actually won. A losing
 * player could settle themselves as the winner mid-game and steal the
 * escrowed stake (the atomic settled flag then blocked the real result).
 *
 * The POST handler has been removed entirely. Every legitimate flow
 * (game/move, game/resign, game/draw, heal-stuck, active-battles fallback,
 * the cron below) computes the winner server-side from the games record and
 * calls settleBattle() directly. There is no valid reason for a client to
 * request a settlement.
 *
 * GET — called by cron to auto-settle battles where a player timed out or
 * disconnected. Protected by CRON_SECRET.
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
