import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Arena tournament system — continuous matchmaking with time-based ending.
 *
 * Scoring: Win = 3 pts, Draw = 1 pt, Loss = 0 pts
 * Streak bonus: after 2 consecutive wins, each subsequent win gets +1 bonus point.
 *
 * Lifecycle:
 * - Start: pair all participants, create games, set ends_at from duration
 * - During play: when a game finishes, players become available; cron re-pairs them
 * - End: when ends_at passes, rank by score desc, wins desc, games_played desc
 *
 * Arena does NOT use tournament_rounds. Games are created directly and
 * results are processed without round-completion checks.
 */

interface ArenaPlayer {
  player_id: string;
  score: number;
  wins: number;
  seed: number;
  rating: number;
}

/**
 * Find available players in an arena tournament (not currently in an active game).
 */
export async function getAvailableArenaPlayers(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
): Promise<ArenaPlayer[]> {
  const { data: participants } = await admin
    .from("tournament_participants")
    .select("player_id, score, wins, seed")
    .eq("tournament_id", tournamentId);

  if (!participants || participants.length === 0) return [];

  // Get all active (non-finished) games in this tournament
  const { data: activeGames } = await admin
    .from("games")
    .select("white_player_id, black_player_id")
    .eq("tournament_id", tournamentId)
    .in("status", ["waiting", "playing", "pending"]);

  const busyPlayers = new Set<string>();
  for (const g of activeGames || []) {
    if (g.white_player_id) busyPlayers.add(g.white_player_id);
    if (g.black_player_id) busyPlayers.add(g.black_player_id);
  }

  const available = participants.filter((p: any) => !busyPlayers.has(p.player_id));
  if (available.length < 2) return [];

  // Fetch ratings for pairing
  const playerIds = available.map((p: any) => p.player_id);
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, rating")
    .in("id", playerIds);

  const ratingMap = new Map((profiles || []).map((p: any) => [p.id, p.rating || 1200]));

  return available.map((p: any) => ({
    player_id: p.player_id,
    score: p.score || 0,
    wins: p.wins || 0,
    seed: p.seed || 0,
    rating: ratingMap.get(p.player_id) || 1200,
  }));
}

/**
 * Get previous matchups to avoid immediate rematches.
 */
export async function getArenaPreviousMatchups(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
): Promise<Set<string>> {
  const { data: games } = await admin
    .from("games")
    .select("white_player_id, black_player_id")
    .eq("tournament_id", tournamentId);

  const matchups = new Set<string>();
  for (const g of games || []) {
    if (g.white_player_id && g.black_player_id) {
      matchups.add(`${g.white_player_id}|${g.black_player_id}`);
      matchups.add(`${g.black_player_id}|${g.white_player_id}`);
    }
  }
  return matchups;
}

/**
 * Pair available arena players by score (similar scores play each other).
 * Avoids immediate rematches. If odd number, the lowest-scored player waits.
 */
export function pairArenaPlayers(
  players: ArenaPlayer[],
  previousMatchups: Set<string>,
): Array<{ white: string; black: string }> {
  if (players.length < 2) return [];

  // Sort by score desc, then rating desc
  const sorted = [...players].sort(
    (a, b) => b.score - a.score || b.rating - a.rating,
  );

  const pairings: Array<{ white: string; black: string }> = [];
  const used = new Set<string>();
  let gameIdx = 0;

  // Phase 1: Greedy pairing avoiding rematches
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(sorted[i].player_id)) continue;

    let paired = false;
    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(sorted[j].player_id)) continue;

      const key = `${sorted[i].player_id}|${sorted[j].player_id}`;
      if (previousMatchups.has(key)) continue;

      // Alternate colors based on game index
      const white = gameIdx % 2 === 0 ? sorted[i].player_id : sorted[j].player_id;
      const black = gameIdx % 2 === 0 ? sorted[j].player_id : sorted[i].player_id;

      pairings.push({ white, black });
      used.add(sorted[i].player_id);
      used.add(sorted[j].player_id);
      paired = true;
      gameIdx++;
      break;
    }
  }

  // Phase 2: Allow rematches for remaining unpaired players
  const remaining = sorted.filter((p) => !used.has(p.player_id));
  for (let i = 0; i + 1 < remaining.length; i += 2) {
    const white = gameIdx % 2 === 0 ? remaining[i].player_id : remaining[i + 1].player_id;
    const black = gameIdx % 2 === 0 ? remaining[i + 1].player_id : remaining[i].player_id;
    pairings.push({ white, black });
    gameIdx++;
  }

  return pairings;
}

/**
 * Create games for arena pairings. Each wave gets an incrementing tournament_round
 * counter, but NO tournament_rounds entries are created.
 */
export async function createArenaGames(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
  pairings: Array<{ white: string; black: string }>,
  tournament: { time_control: string; initial_minutes: number; increment_seconds: number },
  roundNumber: number,
): Promise<void> {
  if (pairings.length === 0) return;

  const playerIds = pairings.flatMap((p) => [p.white, p.black]);
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, rating")
    .in("id", playerIds);
  const ratingMap = new Map((profiles || []).map((p: any) => [p.id, p.rating || 1200]));

  const initialMs = (tournament.initial_minutes || 5) * 60 * 1000;
  const now = new Date().toISOString();

  const gameRows = pairings.map((pairing) => ({
    white_player_id: pairing.white,
    black_player_id: pairing.black,
    white_rating: ratingMap.get(pairing.white) || 1200,
    black_rating: ratingMap.get(pairing.black) || 1200,
    status: "waiting",
    time_control: tournament.time_control || "blitz",
    initial_minutes: tournament.initial_minutes || 5,
    increment_seconds: tournament.increment_seconds || 0,
    rated: false,
    tournament_id: tournamentId,
    tournament_round: roundNumber,
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    turn: "white",
    move_count: 0,
    white_clock_ms: initialMs,
    black_clock_ms: initialMs,
    scheduled_start: now,
  }));

  await admin.from("games").insert(gameRows);
  console.log(`[arena] Created ${gameRows.length} games for tournament ${tournamentId}, round ${roundNumber}`);
}

/**
 * Process arena game result — update scores with 3/1/0 + streak bonus.
 * Does NOT check round completion or finish the tournament.
 */
export async function processArenaGameResult(
  admin: ReturnType<typeof createAdminClient>,
  result: { gameId: string; whitePlayerId: string; blackPlayerId: string; winner: string; status: string },
  tournamentId: string,
): Promise<void> {
  const whiteWon = result.winner === "white";
  const blackWon = result.winner === "black";
  const isDraw = result.winner === "draw" || result.status === "draw" || result.status === "stalemate";

  // Update white player
  const { data: w } = await admin
    .from("tournament_participants")
    .select("score, wins, losses, draws, games_played")
    .eq("tournament_id", tournamentId)
    .eq("player_id", result.whitePlayerId)
    .single();

  if (w) {
    const prevStreak = (w as any).arena_streak || 0;
    const newStreak = whiteWon ? prevStreak + 1 : 0;
    const streakBonus = newStreak >= 2 ? 1 : 0; // +1 bonus after 2+ consecutive wins
    const points = whiteWon ? 3 + streakBonus : isDraw ? 1 : 0;

    await admin
      .from("tournament_participants")
      .update({
        score: w.score + points,
        wins: w.wins + (whiteWon ? 1 : 0),
        losses: w.losses + (blackWon ? 1 : 0),
        draws: w.draws + (isDraw ? 1 : 0),
        games_played: w.games_played + 1,
        arena_streak: newStreak,
      })
      .eq("tournament_id", tournamentId)
      .eq("player_id", result.whitePlayerId);
  }

  // Update black player
  const { data: b } = await admin
    .from("tournament_participants")
    .select("score, wins, losses, draws, games_played")
    .eq("tournament_id", tournamentId)
    .eq("player_id", result.blackPlayerId)
    .single();

  if (b) {
    const prevStreak = (b as any).arena_streak || 0;
    const newStreak = blackWon ? prevStreak + 1 : 0;
    const streakBonus = newStreak >= 2 ? 1 : 0;
    const points = blackWon ? 3 + streakBonus : isDraw ? 1 : 0;

    await admin
      .from("tournament_participants")
      .update({
        score: b.score + points,
        wins: b.wins + (blackWon ? 1 : 0),
        losses: b.losses + (whiteWon ? 1 : 0),
        draws: b.draws + (isDraw ? 1 : 0),
        games_played: b.games_played + 1,
        arena_streak: newStreak,
      })
      .eq("tournament_id", tournamentId)
      .eq("player_id", result.blackPlayerId);
  }

  console.log(`[arena] Processed game ${result.gameId} in tournament ${tournamentId}`);
}

/**
 * Check if an arena tournament should finish (time's up).
 */
export function shouldArenaFinish(tournament: { ends_at: string | null; status: string }): boolean {
  if (tournament.status !== "active") return false;
  if (!tournament.ends_at) return false;
  return new Date(tournament.ends_at).getTime() <= Date.now();
}
