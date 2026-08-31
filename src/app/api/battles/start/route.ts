import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const TIME_CONTROLS: Record<string, { minutes: number; increment: number }> = {
  bullet:    { minutes: 1,  increment: 0 },
  blitz3:    { minutes: 3,  increment: 2 },
  blitz:     { minutes: 5,  increment: 0 },
  rapid:     { minutes: 10, increment: 0 },
  rapid15:   { minutes: 15, increment: 10 },
  classical: { minutes: 30, increment: 0 },
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { battleId, timeControl } = await req.json();
    if (!battleId) return NextResponse.json({ error: "Battle ID required" }, { status: 400 });

    const admin = createAdminClient();

    const { data: battle } = await admin
      .from("battles")
      .select("*")
      .eq("id", battleId)
      .single();

    if (!battle) return NextResponse.json({ error: "Battle not found" }, { status: 404 });

    if (battle.white_player_id !== user.id && battle.black_player_id !== user.id) {
      return NextResponse.json({ error: "Not a battle participant" }, { status: 403 });
    }

    // Idempotency check MUST come before the status check. This endpoint is
    // called with retry logic from the client (and can be double-tapped by
    // an impatient user) — if the first call already succeeded, battle.status
    // is "playing" and game_id is set. Checking status first would reject
    // that retry with "Battle is not pending" even though everything worked,
    // which is exactly what was happening: a successful accept + game
    // creation, followed by a client-side retry that got permanently
    // rejected here instead of just handing back the existing game.
    if (battle.game_id) {
      return NextResponse.json({ gameId: battle.game_id });
    }

    if (battle.status !== "pending") {
      return NextResponse.json({ error: "Battle is not pending" }, { status: 400 });
    }

    // Atomically claim this battle for game creation — only succeeds if
    // status is still "pending". This closes the remaining race: without
    // it, two /start calls that both read status="pending" a moment apart
    // (the client's own retry, or a genuine double-tap/double-send) would
    // both pass the check above and both call create_game, producing two
    // orphaned games for one battle. battles.status has a DB check
    // constraint (pending/playing/completed/draw_armageddon/cancelled/
    // disputed) so we can't invent a new "claiming" value — instead we flip
    // straight to "playing" as the claim itself; if game creation fails we
    // roll back to "pending" below.
    const { data: claimedBattle, error: claimErr } = await admin
      .from("battles")
      .update({ status: "playing", started_at: new Date().toISOString() })
      .eq("id", battleId)
      .eq("status", "pending")
      .select("id")
      .single();

    if (claimErr || !claimedBattle) {
      return NextResponse.json({ error: "Battle is already being started — try again in a moment" }, { status: 409 });
    }

    // Determine time control: battle record > client-provided > config default
    // The battle record is the source of truth — it was set when the battle
    // was created (matchmaking or challenge accept). The client-provided
    // value is a fallback for legacy battles without a stored time_control.
    let minutes = 5;
    let increment = 2;

    const battleTC = (battle as any).time_control;
    if (battleTC && TIME_CONTROLS[battleTC]) {
      minutes = TIME_CONTROLS[battleTC].minutes;
      increment = TIME_CONTROLS[battleTC].increment;
    } else if (timeControl && TIME_CONTROLS[timeControl]) {
      minutes = TIME_CONTROLS[timeControl].minutes;
      increment = TIME_CONTROLS[timeControl].increment;
    } else {
      // Fall back to config
      const { data: config } = await admin.from("battle_config").select("*").limit(1).single();
      minutes = config?.initial_minutes ?? 5;
      increment = config?.increment_seconds ?? 2;
    }

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
      console.error("Game creation failed:", gameErr);
      // Roll back the claim so a retry isn't permanently stuck on "playing" with no game
      await admin.from("battles").update({ status: "pending" }).eq("id", battleId);
      return NextResponse.json({ error: "Failed to start game" }, { status: 500 });
    }

    await admin
      .from("battles")
      .update({ game_id: gameId })
      .eq("id", battleId);

    return NextResponse.json({ gameId, battleId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to start battle" }, { status: 500 });
  }
}
