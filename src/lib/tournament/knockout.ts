/**
 * Knockout tournament pairing engine.
 * Supports two formats:
 * 1. Pure knockout (single elimination from round 1)
 * 2. Group stage → knockout (groups of 4 round-robin, top 2 advance to bracket)
 */

export interface SeedPlayer {
  player_id: string;
  rating: number;
  seed: number;
}

export interface Pairing {
  white: string;
  black: string;
  bye?: string;
}

/**
 * Generate a single-elimination bracket for round 1.
 * Seeds are paired so that high seeds meet low seeds:
 * 1 vs N, 2 vs (N-1), 3 vs (N-2), etc.
 * Odd player counts get byes (highest seeds get byes first).
 */
export function generateKnockoutBracket(players: SeedPlayer[]): Pairing[] {
  const sorted = [...players].sort((a, b) => a.seed - b.seed);
  const n = sorted.length;
  const pairings: Pairing[] = [];

  // Number of byes needed to fill to next power of 2
  const bracketSize = Math.pow(2, Math.ceil(Math.log2(n)));
  const byeCount = bracketSize - n;

  // The top `byeCount` seeds get byes
  const byePlayers = sorted.slice(0, byeCount);
  const playingPlayers = sorted.slice(byeCount);

  // Standard bracket seeding: 1 vs last, 2 vs second-last, etc.
  for (let i = 0; i < playingPlayers.length / 2; i++) {
    const top = playingPlayers[i];
    const bottom = playingPlayers[playingPlayers.length - 1 - i];
    // Alternate colors for fairness
    if (i % 2 === 0) {
      pairings.push({ white: top.player_id, black: bottom.player_id });
    } else {
      pairings.push({ white: bottom.player_id, black: top.player_id });
    }
  }

  // Add byes
  for (const p of byePlayers) {
    pairings.push({ white: "", black: "", bye: p.player_id });
  }

  return pairings;
}

/**
 * Advance to the next knockout round.
 * Takes the winners from the previous round and pairs them
 * in bracket order (winner of match 1 vs winner of match 2, etc.)
 */
export function advanceKnockoutRound(
  winners: string[],
  byes: string[]
): Pairing[] {
  // Combine winners and byes in bracket order
  const allWinners = [...winners, ...byes];
  const pairings: Pairing[] = [];

  for (let i = 0; i < allWinners.length; i += 2) {
    if (i + 1 < allWinners.length) {
      // Alternate colors
      if ((i / 2) % 2 === 0) {
        pairings.push({ white: allWinners[i], black: allWinners[i + 1] });
      } else {
        pairings.push({ white: allWinners[i + 1], black: allWinners[i] });
      }
    } else {
      // Odd player — bye (shouldn't happen in power-of-2 bracket, but safety)
      pairings.push({ white: "", black: "", bye: allWinners[i] });
    }
  }

  return pairings;
}

/**
 * Calculate the number of knockout rounds needed for a given number of players.
 * e.g. 8 players → 3 rounds, 16 players → 4 rounds
 */
export function knockoutRoundCount(playerCount: number): number {
  if (playerCount <= 1) return 0;
  return Math.ceil(Math.log2(playerCount));
}

/**
 * Check if a knockout tournament is complete (only 1 player remains).
 */
export function isKnockoutComplete(remainingPlayers: number): boolean {
  return remainingPlayers <= 1;
}

// ─── Group Stage Helpers ────────────────────────────────────────────

export interface GroupAssignment {
  player_id: string;
  group: number;
  group_seed: number;
}

/**
 * Distribute players into groups of 4 (last group may be smaller).
 * Uses snake seeding for balanced groups.
 */
export function generateGroups(
  players: SeedPlayer[],
  groupSize: number = 4
): GroupAssignment[] {
  const sorted = [...players].sort((a, b) => a.seed - b.seed);
  const numGroups = Math.ceil(sorted.length / groupSize);
  const assignments: GroupAssignment[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const round = Math.floor(i / numGroups);
    let group: number;
    if (round % 2 === 0) {
      group = i % numGroups;
    } else {
      group = numGroups - 1 - (i % numGroups);
    }
    assignments.push({
      player_id: sorted[i].player_id,
      group,
      group_seed: round + 1,
    });
  }

  return assignments;
}

/**
 * Generate round-robin pairings for a group.
 * Uses circle method: fix player 0, rotate the rest.
 * Returns pairings for all rounds of the group.
 */
export function generateGroupRoundRobin(
  playerIds: string[]
): Pairing[][] {
  const players = [...playerIds];
  const rounds: Pairing[][] = [];

  const hasBye = players.length % 2 !== 0;
  if (hasBye) {
    players.push("__bye__");
  }

  const n = players.length;
  const numRounds = n - 1;
  const half = n / 2;

  const arr = [...players];
  for (let round = 0; round < numRounds; round++) {
    const roundPairings: Pairing[] = [];
    for (let i = 0; i < half; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      if (a === "__bye__" || b === "__bye__") {
        const byePlayer = a === "__bye__" ? b : a;
        roundPairings.push({ white: "", black: "", bye: byePlayer });
      } else {
        if ((round + i) % 2 === 0) {
          roundPairings.push({ white: a, black: b });
        } else {
          roundPairings.push({ white: b, black: a });
        }
      }
    }
    rounds.push(roundPairings);

    // Rotate: keep first fixed, rotate the rest
    const last = arr.pop()!;
    arr.splice(1, 0, last);
  }

  return rounds;
}

/**
 * Given group standings, return the top N players who advance to knockouts.
 * Returns them in bracket seeding order.
 */
export function getGroupAdvancers(
  groupStandings: Array<{
    player_id: string;
    group: number;
    score: number;
    wins: number;
    seed: number;
  }>,
  advancePerGroup: number = 2
): string[] {
  type Standing = { player_id: string; group: number; score: number; wins: number; seed: number };
  const byGroup = new Map<number, Standing[]>();
  for (const s of groupStandings) {
    if (!byGroup.has(s.group)) byGroup.set(s.group, []);
    byGroup.get(s.group)!.push(s);
  }

  const groupWinners: string[] = [];
  const groupRunnersUp: string[] = [];

  for (const [groupNum, players] of byGroup) {
    players.sort(
      (a, b) => b.score - a.score || b.wins - a.wins || a.seed - b.seed
    );
    if (players[0]) groupWinners.push(players[0].player_id);
    if (players[1] && advancePerGroup >= 2)
      groupRunnersUp.push(players[1].player_id);
    if (players[2] && advancePerGroup >= 3)
      groupWinners.push(players[2].player_id);
  }

  // Interleave for bracket: Winner A vs Runner-up B, Winner B vs Runner-up A, etc.
  const advancers: string[] = [];
  const maxLen = Math.max(groupWinners.length, groupRunnersUp.length);
  for (let i = 0; i < maxLen; i++) {
    if (groupWinners[i]) advancers.push(groupWinners[i]);
    if (groupRunnersUp[i]) advancers.push(groupRunnersUp[i]);
  }

  return advancers;
}
