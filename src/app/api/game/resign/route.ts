import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { finalizeResign } from "@/lib/game/finalize-resign";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { gameId } = await req.json();

    if (!gameId) {
      return NextResponse.json({ error: "Game ID required" }, { status: 400 });
    }

    const { data: game } = await supabase
      .from("games")
      .select("id, white_player_id, black_player_id, status")
      .eq("id", gameId)
      .single();

    if (!game || game.status !== "playing") {
      return NextResponse.json({ error: "Game not found or not in progress" }, { status: 400 });
    }

    const isWhite = game.white_player_id === user.id;
    const isBlack = game.black_player_id === user.id;

    if (!isWhite && !isBlack) {
      return NextResponse.json({ error: "Not a player in this game" }, { status: 403 });
    }

    // Resign — opponent wins. All settlement (atomic claim, realtime
    // broadcast, ratings, tournament/league, battle escrow) lives in the
    // shared finalizeResign flow, which is also used by abandonment
    // auto-resign so both paths settle identically.
    const winner = isWhite ? "black" : "white";

    const result = await finalizeResign({
      gameId,
      whitePlayerId: game.white_player_id,
      blackPlayerId: game.black_player_id,
      winner,
      resignedPlayerId: user.id,
    });

    if (!result.ok) {
      // Someone else (abandonment enforcement, cron sweep, duplicate
      // request) already resolved this game.
      return NextResponse.json({ error: "Game already resolved" }, { status: 409 });
    }

    return NextResponse.json({ status: "resigned", winner });
  } catch {
    return NextResponse.json({ error: "Resign failed" }, { status: 500 });
  }
}
