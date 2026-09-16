import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { Chess } from "chess.js";

/**
 * GET /api/admin/games/[id]?engine=chess|draughts
 *
 * Full drilldown for one game: row, sanitized player cards (username,
 * display name, rating — never email/phone), linked wagered battle if any,
 * and the move history. Chess moves live in `games.pgn` (parsed via
 * chess.js); draughts moves live in `draughts_games.move_history` (JSONB
 * array of move objects).
 *
 * Admin-only (401/403) — same pattern as the other admin routes.
 */

function formatDraughtsMove(item: any): string {
  if (typeof item === "string") return item;
  if (!item) return "";
  if (item.notation) return item.notation;

  const posToStr = (pos: any): string => {
    if (typeof pos === "string") return pos;
    if (pos && typeof pos.row === "number" && typeof pos.col === "number") {
      const colChar = String.fromCharCode(97 + pos.col);
      const rank = 8 - pos.row;
      return `${colChar}${rank}`;
    }
    return "?";
  };

  const fromStr = posToStr(item.from);
  const toStr = posToStr(item.to);
  const sep = item.captured || item.isCapture ? "x" : "-";
  return `${fromStr}${sep}${toStr}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "Game ID required" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
    const engine = url.searchParams.get("engine") === "draughts" ? "draughts" : "chess";

    let game: any = null;

    if (engine === "draughts") {
      const { data, error } = await admin
        .from("draughts_games")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: "Draughts game not found" }, { status: 404 });
      }
      game = data;
    } else {
      const { data, error } = await admin
        .from("games")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        return NextResponse.json({ error: "Chess game not found" }, { status: 404 });
      }
      game = data;
    }

    // Fetch player profiles (excluding email/phone)
    const playerIds = [game.white_player_id, game.black_player_id].filter(Boolean);
    let profileMap: Record<string, any> = {};

    if (playerIds.length > 0) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, username, display_name, avatar_url, rating, draughts_rating")
        .in("id", playerIds);

      for (const p of profiles || []) {
        profileMap[p.id] = p;
      }
    }

    const whiteProf = profileMap[game.white_player_id] || null;
    const blackProf = profileMap[game.black_player_id] || null;

    const white = {
      id: game.white_player_id,
      username: whiteProf?.username || "Unknown",
      display_name: whiteProf?.display_name || null,
      avatar_url: whiteProf?.avatar_url || null,
      rating: engine === "draughts"
        ? (game.white_rating ?? whiteProf?.draughts_rating ?? 1500)
        : (game.white_rating ?? whiteProf?.rating ?? 1500),
    };

    const black = {
      id: game.black_player_id,
      username: blackProf?.username || "Unknown",
      display_name: blackProf?.display_name || null,
      avatar_url: blackProf?.avatar_url || null,
      rating: engine === "draughts"
        ? (game.black_rating ?? blackProf?.draughts_rating ?? 1500)
        : (game.black_rating ?? blackProf?.rating ?? 1500),
    };

    // Linked wagered battle, if this game is/was a money battle
    // (game_id or armageddon decider armageddon_game_id).
    const { data: battle } = await admin
      .from("battles")
      .select("id, status, result, stake, pot, platform_fee, winner_payout, settled, game_id, armageddon_game_id, created_at, completed_at")
      .or(`game_id.eq.${id},armageddon_game_id.eq.${id}`)
      .maybeSingle();

    // Extract moves
    let moves: string[] = [];

    if (engine === "chess") {
      if (game.pgn) {
        try {
          const chess = new Chess();
          chess.loadPgn(game.pgn);
          moves = chess.history();
        } catch {
          // Fallback: strip PGN headers/comments and split tokens
          moves = game.pgn
            .replace(/\[.*?\]/g, "")
            .replace(/\{[^}]*\}/g, "")
            .replace(/\d+\.\.\./g, "")
            .replace(/\d+\./g, "")
            .replace(/1-0|0-1|1\/2-1\/2|\*/g, "")
            .trim()
            .split(/\s+/)
            .filter((m: string) => m.length > 0);
        }
      }
    } else {
      const historyArr = Array.isArray(game.move_history) ? game.move_history : [];
      moves = historyArr.map((item: any) => formatDraughtsMove(item));
    }

    return NextResponse.json({
      game,
      white,
      black,
      battle: battle || null,
      moves,
    });
  } catch (e: any) {
    console.error("Admin game detail error:", e);
    return NextResponse.json({ error: e.message || "Failed to fetch game details" }, { status: 500 });
  }
}
