import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/games/live — currently broadcastable in-progress games.
 *
 * Broadcast model (owner decision 2026-09-25):
 *   * tournament matches -> ALWAYS broadcast (public events)
 *   * staked battles    -> ALWAYS broadcast (public money matches)
 *   * free play         -> opt-in: a player flips games.broadcast on
 *
 * A game appears here only while status='playing'. Watching is the
 * existing spectator flow (/game/[id] renders the spectator view for
 * anyone who is not a player), so this endpoint is pure discovery.
 * Auth: any signed-in user.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // In-progress games with player profiles (embeds work here: games
    // has real FKs to profiles — unlike the kyc_submissions case).
    const { data: games, error } = await admin
      .from("games")
      .select(`
        id, time_control, initial_minutes, increment_seconds, move_count, created_at,
        tournament_id, broadcast, white_player_id, black_player_id,
        white:profiles!games_white_player_id_fkey(username, display_name, rating, avatar_url, country, identity_verified),
        black:profiles!games_black_player_id_fkey(username, display_name, rating, avatar_url, country, identity_verified)
      `)
      .eq("status", "playing")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (games ?? []).filter((g: any) => g.white_player_id && g.black_player_id);

    // Battle stakes for these games (a game is a staked battle when a
    // battles row points at it via game_id or armageddon_game_id).
    const ids = rows.map((g: any) => g.id);
    const { data: battles } = ids.length
      ? await admin.from("battles").select("game_id, armageddon_game_id, stake, status").in("game_id", ids)
      : { data: [] as any[] };
    const stakeByGame = new Map<string, number>();
    for (const b of (battles ?? []) as any[]) {
      if ((b.stake ?? 0) > 0) {
        if (b.game_id) stakeByGame.set(b.game_id, b.stake);
        if (b.armageddon_game_id) stakeByGame.set(b.armageddon_game_id, b.stake);
      }
    }

    // Tournament names (games.tournament_id has no FK constraint, so we
    // fetch separately and merge in JS — same pattern as the KYC fix).
    const tIds = [...new Set(rows.filter((g: any) => g.tournament_id).map((g: any) => g.tournament_id))];
    const { data: tournaments } = tIds.length
      ? await admin.from("tournaments").select("id, name").in("id", tIds)
      : { data: [] as any[] };
    const nameByTournament = new Map<string, string>(
      ((tournaments ?? []) as any[]).map((t) => [t.id, t.name])
    );

    // Keep only broadcastable games, categorized.
    const live = rows
      .map((g: any) => {
        const stake = stakeByGame.get(g.id) ?? 0;
        const category = stake > 0 ? "battle" : g.tournament_id ? "tournament" : g.broadcast ? "free" : null;
        return {
          id: g.id,
          category,
          stake: stake > 0 ? stake : null,
          tournamentId: g.tournament_id ?? null,
          tournamentName: g.tournament_id ? (nameByTournament.get(g.tournament_id) ?? null) : null,
          timeControl: g.time_control,
          moveCount: g.move_count ?? 0,
          createdAt: g.created_at,
          white: {
            name: g.white?.display_name || g.white?.username || "White",
            rating: g.white?.rating ?? null,
            avatarUrl: g.white?.avatar_url ?? null,
            country: g.white?.country ?? null,
            verified: g.white?.identity_verified === true,
          },
          black: {
            name: g.black?.display_name || g.black?.username || "Black",
            rating: g.black?.rating ?? null,
            avatarUrl: g.black?.avatar_url ?? null,
            country: g.black?.country ?? null,
            verified: g.black?.identity_verified === true,
          },
        };
      })
      .filter((g: any) => g.category !== null)
      // Spectacle first: biggest stakes, then tournaments, then free play.
      .sort((a: any, b: any) => {
        const catOrder = (c: string) => (c === "battle" ? 0 : c === "tournament" ? 1 : 2);
        if (catOrder(a.category) !== catOrder(b.category)) return catOrder(a.category) - catOrder(b.category);
        if (a.category === "battle" && b.category === "battle") return (b.stake ?? 0) - (a.stake ?? 0);
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, 12);

    return NextResponse.json({ games: live, serverTime: new Date().toISOString() });
  } catch (err) {
    console.error("live games error:", err);
    return NextResponse.json({ error: "Could not load live games" }, { status: 500 });
  }
}
