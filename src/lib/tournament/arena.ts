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
 * Get each player's most recent opponent in the arena.
 * Returns a Map<playerId, lastOpponentId>.
 *
 * This is the key anti-rematch mechanism: we only avoid pairing a player
 * with the opponent they JUST played. Unlike the old approach (which blocked
 * ALL previous matchups and then force-rematched in Phase 2), this lets
 * players meet again later in the arena after playing other opponents,
 * while preventing the immediate "both free → instant rematch" problem.
 */
export async function getArenaLastOpponents(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
): Promise<Map<string, string>> {
  // Fetch games ordered by most recent first.
  // We rely on created_at ordering to determine which game was "last" for each player.
  const { data: games } = await admin
    .from("games")
    .select("white_player_id, black_player_id, created_at")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false })
    .limit(200);

  const lastOpponent = new Map<string, string>();

  for (const g of games || []) {
    const w = g.white_player_id as string;
    const b = g.black_player_id as string;
    if (!lastOpponent.has(w)) lastOpponent.set(w, b);
    if (!lastOpponent.has(b)) lastOpponent.set(b, w);
  }

  return lastOpponent;
}

/**
 * Pair available arena players by score (similar scores play each other).
 * Avoids pairing a player with their most recent opponent.
 * If the only available pairing would be an immediate rematch, those
 * players simply wait until someone else becomes free.
 */
export function pairArenaPlayers(
  players: ArenaPlayer[],
  lastOpponents: Map<string, string>,
): Array<{ white: string; black: string }> {
  if (players.length < 2) return [];

  // Sort by score desc, then rating desc
  const sorted = [...players].sort(
    (a, b) => b.score - a.score || b.rating - a.rating,
  );

  const pairings: Array<{ white: string; black: string }> = [];
  const used = new Set<string>();
  let gameIdx = 0;

  // Greedy pairing: for each player, find the best available opponent
  // who is NOT their most recent opponent.
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(sorted[i].player_id)) continue;

    let paired = false;
    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(sorted[j].player_id)) continue;

      // Skip if these two just played each other
      const lastA = lastOpponents.get(sorted[i].player_id);
      const lastB = lastOpponents.get(sorted[j].player_id);
      if (lastA === sorted[j].player_id && lastB === sorted[i].player_id) continue;

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

    // If no valid opponent found, this player waits.
    // Do NOT force a rematch — they'll be paired next wave when someone else is free.
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
    .select("score, wins, losses, draws, games_played, arena_streak")
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
    .select("score, wins, losses, draws, games_played, arena_streak")
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

/**
 * Run one matchmaking wave for an active arena tournament: find available
 * (not-currently-playing) participants, pair them up avoiding immediate
 * rematches, and create games for the new pairings.
 *
 * If the only free players just played each other, they will NOT be paired
 * — they wait until another player becomes free.
 *
 * This is the single source of truth for arena pairing and is meant to be
 * called EVENT-DRIVEN (right after a game finishes, right after a player
 * joins mid-arena) as well as from the periodic cron sweep.
 *
 * Returns the number of new games created (0 if nobody was available to pair
 * or if the only available pairing would be an immediate rematch).
 */
export async function runArenaMatchmakingWave(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string,
): Promise<number> {
  const { data: tournament } = await admin
    .from("tournaments")
    .select("id, status, current_round, time_control, initial_minutes, increment_seconds")
    .eq("id", tournamentId)
    .single();

  if (!tournament || tournament.status !== "active") return 0;

  const available = await getAvailableArenaPlayers(admin, tournamentId);
  if (available.length < 2) return 0;

  const lastOpponents = await getArenaLastOpponents(admin, tournamentId);
  const pairings = pairArenaPlayers(available, lastOpponents);
  if (pairings.length === 0) return 0;

  const nextWave = (tournament.current_round || 1) + 1;
  await createArenaGames(
    admin,
    tournamentId,
    pairings,
    {
      time_control: tournament.time_control,
      initial_minutes: tournament.initial_minutes,
      increment_seconds: tournament.increment_seconds,
    },
    nextWave,
  );

  await admin.from("tournaments").update({ current_round: nextWave }).eq("id", tournamentId);

  console.log(`[arena] Matchmaking wave for ${tournamentId}: created ${pairings.length} game(s), wave ${nextWave}`);
  return pairings.length;
}
