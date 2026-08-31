import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — list recent games with player info
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const status = url.searchParams.get("status");

    let query = admin
      .from("games")
      .select(`
        id, status, time_control, rated, white_player_id, black_player_id,
        white_rating, black_rating, winner, created_at, ended_at,
        move_count, pgn
      `)
      .order("created_at", { ascending: false })
      .limit(50);

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: games, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Get player usernames
    const playerIds = new Set<string>();
    for (const g of games || []) {
      if (g.white_player_id) playerIds.add(g.white_player_id);
      if (g.black_player_id) playerIds.add(g.black_player_id);
    }

    let playerMap: Record<string, string> = {};
    if (playerIds.size > 0) {
      const { data: players } = await admin
        .from("profiles")
        .select("id, username")
        .in("id", Array.from(playerIds));
      for (const p of players || []) {
        playerMap[p.id] = p.username;
      }
    }

    return NextResponse.json({
      games: games?.map(g => ({
        ...g,
        white_username: playerMap[g.white_player_id] || "?",
        black_username: playerMap[g.black_player_id] || "?",
        move_count: g.move_count || 0,
      })) || [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to fetch games" }, { status: 500 });
  }
}

// PATCH — abort a game or manually override result
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { gameId, action, winner, note } = await req.json();
    if (!gameId || !action) return NextResponse.json({ error: "Missing parameters" }, { status: 400 });

    if (action === "abort") {
      const { error } = await admin
        .from("games")
        .update({ status: "abort", winner: null, ended_at: new Date().toISOString() })
        .eq("id", gameId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else if (action === "set_result") {
      if (!winner || !["white", "black", "draw"].includes(winner)) {
        return NextResponse.json({ error: "Invalid winner. Must be 'white', 'black', or 'draw'" }, { status: 400 });
      }

      const { data: game, error: gameErr } = await admin
        .from("games")
        .select("id, status, white_player_id, black_player_id, winner, rated")
        .eq("id", gameId)
        .single();

      if (gameErr || !game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

      const isCorrecting = game.status === "completed" && game.winner !== null;

      const gameStatus = winner === "draw" ? "draw" : "completed";
      const winnerValue = winner === "draw" ? null : winner;

      const { error: updateErr } = await admin
        .from("games")
        .update({
          status: gameStatus,
          winner: winnerValue,
          ended_at: new Date().toISOString(),
        })
        .eq("id", gameId);

      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

      // Handle battle settlement if this game is linked to a battle
      const { data: battle } = await admin
        .from("battles")
        .select("id, settled, white_player_id, black_player_id, stake, winner_payout")
        .or(`game_id.eq.${gameId},armageddon_game_id.eq.${gameId}`)
        .single();

      if (battle && !battle.settled) {
        let winnerId: string | null = null;
        if (winner === "white") winnerId = game.white_player_id;
        else if (winner === "black") winnerId = game.black_player_id;

        const { settleBattle } = await import("@/lib/battles/settle");
        try {
          await settleBattle(battle.id, winnerId, `admin_override:${winner}`);
        } catch (err: any) {
          console.error("Admin override battle settlement failed:", err);
        }
      }

      if (game.rated && isCorrecting) {
        console.log(`Admin override on rated game ${gameId}: ratings may need manual correction`);
      }
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    try {
      await admin.from("admin_logs").insert({
        admin_id: user.id,
        action: `game_${action}${winner ? `:${winner}` : ""}`,
        target_type: "game",
        target_id: gameId,
        notes: note || null,
      });
    } catch {}

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
