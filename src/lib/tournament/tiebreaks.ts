import { createAdminClient } from "@/lib/supabase/admin";

export interface ParticipantWithTiebreak {
  player_id: string;
  score: number;
  wins: number;
  losses: number;
  draws: number;
  games_played: number;
  seed: number;
  final_rank?: number;
  buchholz_total: number;
  buchholz_cut1: number;  // Buchholz with worst opponent removed
  sonneborn_berger: number;
  opponents: string[];
}

/**
 * Calculate Swiss tournament tiebreaks for all participants.
 *
 * 1. Score (primary)
 * 2. Buchholz Cut 1 (sum of opponents' scores, excluding worst opponent)
 *    — standard FIDE tiebreak, more fair than raw wins
 * 3. Sonneborn-Berger (defeated opponents' scores * 1 + drawn opponents' scores * 0.5)
 * 4. Wins (count of wins)
 * 5. Seed (lower seed = higher rank, initial rating-based)
 *
 * Returns participants sorted by tiebreak order, ready for final ranking.
 */
export async function calculateTiebreaks(
  admin: ReturnType<typeof createAdminClient>,
  tournamentId: string
): Promise<ParticipantWithTiebreak[]> {
  // Fetch all participants
  const { data: participants } = await admin
    .from("tournament_participants")
    .select("player_id, score, wins, losses, draws, games_played, seed")
    .eq("tournament_id", tournamentId)
    .order("score", { ascending: false })
    .order("seed", { ascending: true });

  if (!participants || participants.length === 0) return [];

  // Fetch all tournament games to determine who played whom
  const { data: games } = await admin
    .from("games")
    .select("white_player_id, black_player_id, status, winner")
    .eq("tournament_id", tournamentId)
    .in("status", ["checkmate", "resign", "draw", "stalemate", "timeout", "white_win", "black_win"]);

  // Build opponent map: player_id -> list of opponent player_ids
  const opponentMap: Record<string, string[]> = {};
  for (const g of games || []) {
    if (!opponentMap[g.white_player_id]) opponentMap[g.white_player_id] = [];
    if (!opponentMap[g.black_player_id]) opponentMap[g.black_player_id] = [];
    opponentMap[g.white_player_id].push(g.black_player_id);
    opponentMap[g.black_player_id].push(g.white_player_id);
  }

  // Create a score lookup
  const scoreMap: Record<string, number> = {};
  for (const p of participants) {
    scoreMap[p.player_id] = p.score || 0;
  }

  // Calculate tiebreaks for each participant
  const withTiebreaks: ParticipantWithTiebreak[] = participants.map((p) => {
    const opponents = opponentMap[p.player_id] || [];
    const opponentScores = opponents.map((oppId) => scoreMap[oppId] || 0).sort((a, b) => a - b);

    // Buchholz Total: sum of all opponents' scores
    const buchholz_total = opponentScores.reduce((sum, s) => sum + s, 0);

    // Buchholz Cut 1: sum of opponents' scores excluding the worst (lowest) opponent
    const buchholz_cut1 = opponentScores.length > 1
      ? opponentScores.slice(1).reduce((sum, s) => sum + s, 0) // remove lowest
      : buchholz_total;

    // Sonneborn-Berger: sum of (defeated opponents' scores * 1) + (drawn opponents' scores * 0.5)
    // Need to know result of each game
    let sonneborn_berger = 0;
    for (const g of games || []) {
      const isWhite = g.white_player_id === p.player_id;
      const isBlack = g.black_player_id === p.player_id;
      if (!isWhite && !isBlack) continue;

      const opponentId = isWhite ? g.black_player_id : g.white_player_id;
      const oppScore = scoreMap[opponentId] || 0;

      // Determine result from this player's perspective
      let result: "win" | "loss" | "draw" | null = null;
      if (g.status === "draw" || g.status === "stalemate") {
        result = "draw";
      } else if (g.winner) {
        if (g.winner === "white" && isWhite) result = "win";
        else if (g.winner === "black" && isBlack) result = "win";
        else result = "loss";
      } else if (g.status === "white_win") {
        result = isWhite ? "win" : "loss";
      } else if (g.status === "black_win") {
        result = isBlack ? "win" : "loss";
      }

      if (result === "win") sonneborn_berger += oppScore;
      else if (result === "draw") sonneborn_berger += oppScore * 0.5;
    }

    return {
      player_id: p.player_id,
      score: p.score || 0,
      wins: p.wins || 0,
      losses: p.losses || 0,
      draws: p.draws || 0,
      games_played: p.games_played || 0,
      seed: p.seed || 0,
      buchholz_total,
      buchholz_cut1,
      sonneborn_berger,
      opponents,
    };
  });

  // Sort by tiebreak order:
  // 1. Score (desc)
  // 2. Buchholz Cut 1 (desc) — strength of opposition
  // 3. Sonneborn-Berger (desc) — quality of results
  // 4. Wins (desc)
  // 5. Seed (asc) — initial seeding
  withTiebreaks.sort(
    (a, b) =>
      b.score - a.score ||
      b.buchholz_cut1 - a.buchholz_cut1 ||
      b.sonneborn_berger - a.sonneborn_berger ||
      b.wins - a.wins ||
      a.seed - b.seed
  );

  // Assign final ranks
  withTiebreaks.forEach((p, i) => {
    p.final_rank = i + 1;
  });

  return withTiebreaks;
}
