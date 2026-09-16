import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processTournamentGameResult, findPairingForPlayers } from "@/lib/tournament/results";

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
    // AUDIT 2026-09-16: draughts games were invisible to the admin Games
    // tab — the list only queried the chess `games` table. engine=draughts
    // lists draughts_games instead (same shape: both tables share column
    // names for the fields selected here).
    const engine = url.searchParams.get("engine") === "draughts" ? "draughts" : "chess";

    let query = admin
      .from(engine === "draughts" ? "draughts_games" : "games")
      .select(`
        id, status, time_control, rated, white_player_id, black_player_id,
        white_rating, black_rating, winner, created_at, ended_at,
        move_count
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
        engine,
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

    let tournamentRecorded = false;

    if (action === "abort") {
      const { data: abortGame } = await admin
        .from("games")
        .select("tournament_id")
        .eq("id", gameId)
        .single();
      if (abortGame?.tournament_id) {
        return NextResponse.json(
          { error: "This is a tournament game — aborting it would leave the pairing unrecorded and stall the round. Use the result override instead." },
          { status: 409 }
        );
      }
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
        .select("id, status, white_player_id, black_player_id, winner, rated, tournament_id, tournament_round")
        .eq("id", gameId)
        .single();

      if (gameErr || !game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

      const isCorrecting = game.status === "completed" && game.winner !== null;

      // ── Guards: refuse overrides that would desync tournament/league state ──
      let tournamentType: string | null = null;
      if (game.tournament_id) {
        const { data: t } = await admin
          .from("tournaments")
          .select("type")
          .eq("id", game.tournament_id)
          .single();
        tournamentType = t?.type ?? null;
      }
      const isTerminal = ["checkmate", "stalemate", "draw", "resign", "timeout", "completed"].includes(game.status);

      if (game.tournament_id) {
        if (tournamentType === "arena") {
          // Arena has no idempotency marker: re-processing an already-processed
          // arena game would double-count score/wins and corrupt prize standings.
          if (isTerminal) {
            return NextResponse.json(
              { error: "This arena game already has a result. Overriding would double-count arena points — adjust via SQL if needed." },
              { status: 409 }
            );
          }
        } else {
          // Round-based: block only if the pairing result is already recorded
          // (corrections would desync stats/standings). Unrecorded results are
          // exactly what the override is for.
          const { data: round } = await admin
            .from("tournament_rounds")
            .select("id, pairings")
            .eq("tournament_id", game.tournament_id)
            .eq("round_number", game.tournament_round || 1)
            .maybeSingle();
          const pairings = (round?.pairings as Array<Record<string, any>>) || [];
          const rec = findPairingForPlayers(pairings, game.white_player_id, game.black_player_id);
          if (rec && rec.result !== null && rec.result !== undefined) {
            return NextResponse.json(
              { error: "This tournament match is already recorded in the round. Overriding would desync standings — void the round or contact support." },
              { status: 409 }
            );
          }
        }
      }

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

      // ── Record into tournament / league immediately (cron reconcile is only
      // a backstop for round tournaments; arena and leagues have no sweep) ──
      if (game.tournament_id) {
        try {
          await processTournamentGameResult({
            gameId,
            whitePlayerId: game.white_player_id,
            blackPlayerId: game.black_player_id,
            winner,
            status: "admin_override",
          });
          tournamentRecorded = true;
        } catch (err) {
          console.error("Admin override tournament processing failed:", err);
        }
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

    return NextResponse.json({ success: true, tournamentRecorded });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
