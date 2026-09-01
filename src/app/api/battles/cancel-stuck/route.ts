import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Manual escape hatch for a battle that never got its game created
 * (status still "pending", game_id still null) even after the automatic
 * retry in /api/battles/active. Refunds both players' locked stakes and
 * marks the battle cancelled. Either participant can trigger this — it
 * only applies to a state that should never persist under normal play.
 * Body: { battleId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { battleId } = await req.json();
    if (!battleId) return NextResponse.json({ error: "Battle ID required" }, { status: 400 });

    const admin = createAdminClient();

    const { data: battle } = await admin.from("battles").select("*").eq("id", battleId).single();
    if (!battle) return NextResponse.json({ error: "Battle not found" }, { status: 404 });

    if (battle.white_player_id !== user.id && battle.black_player_id !== user.id) {
      return NextResponse.json({ error: "Not a battle participant" }, { status: 403 });
    }

    if (battle.status !== "pending") {
      return NextResponse.json(
        { error: "This battle isn't stuck — it has been settled or is actively playing." },
        { status: 400 }
      );
    }

    // If the battle has a game_id, check if the game is already finished.
    // If it is, settle via the self-heal path instead of cancelling — the
    // game result should determine the winner, not a blind refund.
    if (battle.game_id) {
      const { data: game } = await admin
        .from("games")
        .select("status, winner")
        .eq("id", battle.game_id)
        .single();

      if (game && game.status !== "playing" && game.status !== "waiting") {
        // Game is over — tell the player to refresh, the self-heal in
        // /api/battles/active will settle it on next check.
        return NextResponse.json(
          { error: "The game has already finished. Go back and refresh — it will be settled automatically." },
          { status: 400 }
        );
      }

      if (game && (game.status === "playing" || game.status === "waiting")) {
        // Game is still live — the battle status is just wrong. Correct it
        // instead of cancelling, then redirect the player to the game.
        await admin
          .from("battles")
          .update({ status: "playing", started_at: battle.started_at || new Date().toISOString() })
          .eq("id", battleId)
          .eq("status", "pending");
        return NextResponse.json({ corrected: true, gameId: battle.game_id });
      }
    }

    // No game_id — safe to cancel and refund.
    // Atomic claim so two simultaneous cancel clicks (one from each player) don't double-refund.
    const { data: claimed } = await admin
      .from("battles")
      .update({ status: "cancelled", notes: "Auto-cancelled: game creation failed and stayed stuck." })
      .eq("id", battleId)
      .eq("status", "pending")
      .is("game_id", null)
      .select("id")
      .single();

    if (!claimed) {
      return NextResponse.json({ error: "This battle isn't stuck anymore." }, { status: 400 });
    }

    await admin.rpc("credit_wallet", { p_user_id: battle.white_player_id, p_amount: battle.stake });
    await admin.rpc("credit_wallet", { p_user_id: battle.black_player_id, p_amount: battle.stake });

    await admin.from("deposits").insert([
      {
        user_id: battle.white_player_id,
        amount: battle.stake,
        status: "success",
        method: "battle_refund",
        reference: `battle_cancel:${battleId}:white`,
      },
      {
        user_id: battle.black_player_id,
        amount: battle.stake,
        status: "success",
        method: "battle_refund",
        reference: `battle_cancel:${battleId}:black`,
      },
    ]);

    return NextResponse.json({ cancelled: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
