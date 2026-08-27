import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { settleBattle } from "@/lib/battles/settle";

/**
 * Check if the current user has an active battle (pending/playing/draw_armageddon)
 * blocking them from starting a new one.
 *
 * Self-healing:
 * 1. If the battle is stuck in "pending" with no game_id, retries game creation.
 * 2. If the battle's game has ended but the battle wasn't settled (the
 *    fire-and-forget settleBattle call failed silently), settles it now
 *    so the player isn't trapped looking at a finished game.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    const { data: battle } = await admin
      .from("battles")
      .select("*")
      .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
      .in("status", ["pending", "playing", "draw_armageddon"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!battle) return NextResponse.json({ active: false });

    // ── SELF-HEAL: Game over but battle not settled ──
    // The fire-and-forget settleBattle() call in the move/resign/timeout
    // handlers can fail silently, leaving the battle stuck in "playing"
    // even though the game is done. Check the game status and settle now.
    const currentGameId = battle.status === "draw_armageddon" ? battle.armageddon_game_id : battle.game_id;
    if (currentGameId && (battle.status === "playing" || battle.status === "draw_armageddon")) {
      const { data: game } = await admin
        .from("games")
        .select("status, winner")
        .eq("id", currentGameId)
        .single();

      if (game && game.status !== "playing" && game.status !== "waiting") {
        // Game is over — settle the battle now
        const isArmageddon = battle.armageddon_game_id === currentGameId;
        let battleWinnerId: string | null = null;
        if (game.winner === "white") {
          battleWinnerId = isArmageddon ? battle.black_player_id : battle.white_player_id;
        } else if (game.winner === "black") {
          battleWinnerId = isArmageddon ? battle.white_player_id : battle.black_player_id;
        }
        // winner null = draw → battleWinnerId stays null → triggers armageddon
        try {
          await settleBattle(battle.id, battleWinnerId, game.status || "draw");
        } catch (e) {
          console.error("Self-heal battle settlement failed:", e);
        }

        // Re-check battle status after settlement
        const { data: updatedBattle } = await admin
          .from("battles")
          .select("status, settled")
          .eq("id", battle.id)
          .single();

        if (updatedBattle?.settled || updatedBattle?.status === "completed") {
          // Battle is done — not active anymore
          return NextResponse.json({ active: false });
        }

        // If settlement triggered armageddon, the battle is now in draw_armageddon
        // with a new game. Re-query to get the updated battle.
        const { data: refreshedBattle } = await admin
          .from("battles")
          .select("*")
          .eq("id", battle.id)
          .single();

        if (refreshedBattle && (refreshedBattle.status === "playing" || refreshedBattle.status === "draw_armageddon")) {
          const newGameId = refreshedBattle.status === "draw_armageddon"
            ? refreshedBattle.armageddon_game_id
            : refreshedBattle.game_id;
          if (newGameId) {
            return NextResponse.json({
              active: true,
              battleId: refreshedBattle.id,
              gameId: newGameId,
              status: refreshedBattle.status,
            });
          }
        }

        return NextResponse.json({ active: false });
      }
    }

    // Already has a live/armageddon game — just point the client at it.
    if (currentGameId) {
      return NextResponse.json({ active: true, battleId: battle.id, gameId: currentGameId, status: battle.status });
    }

    if (battle.status !== "pending") {
      // draw_armageddon without a game_id yet — settlement will create it shortly.
      return NextResponse.json({ active: true, battleId: battle.id, status: battle.status, stuck: false });
    }

    // Stuck pending, no game — self-heal by retrying game creation now that
    // the RPC signature / time_control constraint bug is fixed.
    const { data: config } = await admin.from("battle_config").select("*").limit(1).single();
    const minutes = config?.initial_minutes ?? 5;
    const increment = config?.increment_seconds ?? 2;

    const { data: gameId, error: gameErr } = await admin.rpc("create_game", {
      p_white_id: battle.white_player_id,
      p_black_id: battle.black_player_id,
      p_white_rating: battle.white_rating ?? 1200,
      p_black_rating: battle.black_rating ?? 1200,
      p_time_control: "battle",
      p_initial_minutes: minutes,
      p_increment_seconds: increment,
      p_rated: true,
    });

    if (gameErr || !gameId) {
      console.error("Self-heal game creation retry failed:", gameErr);
      return NextResponse.json({
        active: true,
        battleId: battle.id,
        status: "pending",
        stuck: true,
        stake: battle.stake,
        createdAt: battle.created_at,
      });
    }

    await admin
      .from("battles")
      .update({ game_id: gameId, status: "playing", started_at: new Date().toISOString() })
      .eq("id", battle.id);

    return NextResponse.json({ active: true, battleId: battle.id, gameId, status: "playing" });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
