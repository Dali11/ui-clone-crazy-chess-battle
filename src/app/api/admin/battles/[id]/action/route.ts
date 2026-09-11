import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyBattleJoinWindow } from "@/lib/battles/join-window";
import { createClient } from "@/lib/supabase/server";
import { settleBattle } from "@/lib/battles/settle";

const TIME_CONTROLS: Record<string, { minutes: number; increment: number }> = {
  bullet: { minutes: 1, increment: 0 }, blitz3: { minutes: 3, increment: 2 },
  blitz: { minutes: 5, increment: 0 }, rapid: { minutes: 10, increment: 0 },
  rapid15: { minutes: 15, increment: 10 }, classical: { minutes: 30, increment: 0 },
};

/**
 * POST /api/admin/battles/[id]/action
 * Body: { action: "cancel_refund" | "retry_game" | "force_settle", winnerId?: string }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: battleId } = await params;
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: adminProfile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!adminProfile?.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const { action, winnerId } = await req.json();
    if (!action) return NextResponse.json({ error: "action required" }, { status: 400 });

    const { data: battle, error: fetchErr } = await admin.from("battles").select("*").eq("id", battleId).single();
    if (fetchErr || !battle) return NextResponse.json({ error: "Battle not found" }, { status: 404 });

    if (action === "cancel_refund") {
      if (battle.status !== "pending")
        return NextResponse.json({ error: `Cannot cancel a battle with status "${battle.status}"` }, { status: 400 });

      // AUDIT FIX 2026-09-11: also require no game linked — cancelling a
      // battle whose game exists would refund stakes on a live board.
      const { data: claimed } = await admin.from("battles")
        .update({ status: "cancelled", notes: `Admin-cancelled by ${user.id} via admin panel.` })
        .eq("id", battleId).eq("status", "pending").is("game_id", null).select("id").single();

      if (!claimed) return NextResponse.json({ error: "Battle status changed or a game already exists — refresh and try again." }, { status: 409 });

      const [{ error: c1 }, { error: c2 }] = await Promise.all([
        admin.rpc("credit_wallet", { p_user_id: battle.white_player_id, p_amount: battle.stake }),
        admin.rpc("credit_wallet", { p_user_id: battle.black_player_id, p_amount: battle.stake }),
      ]);
      if (c1 || c2) return NextResponse.json({ error: "Refund failed — battle cancelled but wallets not credited." }, { status: 500 });

      await admin.from("deposits").insert([
        { user_id: battle.white_player_id, amount: battle.stake, status: "success", method: "battle_refund", reference: `admin_cancel:${battleId}:white` },
        { user_id: battle.black_player_id, amount: battle.stake, status: "success", method: "battle_refund", reference: `admin_cancel:${battleId}:black` },
      ]);
      await admin.from("battle_escrow").update({ status: "refunded", released_at: new Date().toISOString() }).eq("battle_id", battleId);

      return NextResponse.json({ success: true, action: "cancel_refund" });
    }

    if (action === "retry_game") {
      if (battle.status !== "pending" || battle.game_id)
        return NextResponse.json({ error: "Battle already has a game or isn't pending." }, { status: 400 });

      const { data: configRow } = await admin.from("battle_config").select("*").limit(1).single();
      const tcConfig = battle.time_control && TIME_CONTROLS[battle.time_control];
      const minutes = tcConfig?.minutes ?? configRow?.initial_minutes ?? 5;
      const increment = tcConfig?.increment ?? configRow?.increment_seconds ?? 2;

      const { data: gameId, error: gameErr } = await admin.rpc("create_game", {
        p_white_id: battle.white_player_id, p_black_id: battle.black_player_id,
        p_white_rating: battle.white_rating ?? 1200, p_black_rating: battle.black_rating ?? 1200,
        p_time_control: "battle", p_initial_minutes: minutes, p_increment_seconds: increment, p_rated: true,
      });

      if (gameErr || !gameId) return NextResponse.json({ error: "Game creation failed — try Cancel & Refund instead." }, { status: 500 });

      // AUDIT FIX 2026-09-11: atomic claim — two admins double-clicking
      // used to create two games; the loser of the claim has its fresh
      // game aborted so no orphan "playing" game pollutes player lists.
      const { data: claimedBattle } = await admin.from("battles")
        .update({ game_id: gameId, status: "playing", started_at: new Date().toISOString() })
        .eq("id", battleId).eq("status", "pending").is("game_id", null)
        .select("id").single();

      if (!claimedBattle) {
        await admin.from("games").update({ status: "abort", winner: null, ended_at: new Date().toISOString() }).eq("id", gameId);
        return NextResponse.json({ error: "Another admin just started this battle — refresh." }, { status: 409 });
      }
      await applyBattleJoinWindow(admin, gameId);
      return NextResponse.json({ success: true, action: "retry_game", gameId });
    }

    if (action === "force_settle") {
      if (!winnerId || (winnerId !== battle.white_player_id && winnerId !== battle.black_player_id))
        return NextResponse.json({ error: "winnerId must be one of the two players" }, { status: 400 });
      if (battle.settled) return NextResponse.json({ error: "Battle is already settled" }, { status: 400 });

      try {
        const result = await settleBattle(battleId, winnerId, "admin_override");
        return NextResponse.json({ success: true, action: "force_settle", result });
      } catch (e: any) {
        return NextResponse.json({ error: e.message || "Settlement failed" }, { status: 500 });
      }
    }

    return NextResponse.json({ error: `Unknown action "${action}"` }, { status: 400 });
  } catch (e: any) {
    console.error("[admin/battles/action] error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
