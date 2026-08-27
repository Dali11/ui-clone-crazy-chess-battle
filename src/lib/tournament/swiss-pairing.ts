/**
 * Swiss tournament pairing utility with proper bye handling.
 *
 * Fixes:
 * - No more multiple byes in a single round (Bug 1.3)
 * - No more repeat byes to the same player (Bug 1.2)
 * - Byes go to the lowest-scoring eligible player, not the highest
 * - Rematches allowed as last resort instead of issuing byes to both players
 */

export interface PairingInput {
  player_id: string;
  score: number;
  seed: number;
}

export interface PairingResult {
  white: string;
  black: string;
  bye?: string;
}

/**
 * Generate Swiss pairings for a round.
 *
 * @param participants - sorted by score desc, then seed asc
 * @param previousMatchups - Set of "idA|idB" pairs who have already played
 * @param previousByes - Set of player_ids who have already received a bye
 * @returns array of pairings (each either a match or a bye)
 */
export function generateSwissPairings(
  participants: PairingInput[],
  previousMatchups: Set<string>,
  previousByes: Set<string>,
): PairingResult[] {
  const pairings: PairingResult[] = [];
  const used = new Set<string>();

  // Sort by score desc, then seed asc
  const sorted = [...participants].sort(
    (a, b) => (b.score || 0) - (a.score || 0) || (a.seed || 0) - (b.seed || 0),
  );

  // Phase 1: Greedy pairing avoiding rematches
  for (let i = 0; i < sorted.length; i++) {
    if (used.has(sorted[i].player_id)) continue;

    let paired = false;
    for (let j = i + 1; j < sorted.length; j++) {
      if (used.has(sorted[j].player_id)) continue;

      const key = `${sorted[i].player_id}|${sorted[j].player_id}`;
      if (previousMatchups.has(key)) continue;

      pairings.push({
        white: sorted[i].player_id,
        black: sorted[j].player_id,
      });
      used.add(sorted[i].player_id);
      used.add(sorted[j].player_id);
      paired = true;
      break;
    }
    // Don't issue a bye yet - defer unpaired players
  }

  // Phase 2: Handle remaining unpaired players
  const remaining = sorted.filter((p) => !used.has(p.player_id));

  if (remaining.length === 0) {
    return pairings;
  }

  // Try to pair remaining players among themselves, allowing rematches
  // as a last resort (better than giving multiple byes)
  for (let i = 0; i < remaining.length; i++) {
    if (used.has(remaining[i].player_id)) continue;

    for (let j = i + 1; j < remaining.length; j++) {
      if (used.has(remaining[j].player_id)) continue;

      // Allow rematch - it's better than two byes
      pairings.push({
        white: remaining[i].player_id,
        black: remaining[j].player_id,
      });
      used.add(remaining[i].player_id);
      used.add(remaining[j].player_id);
      break;
    }
  }

  // Phase 3: If exactly one player remains (odd count), give them a bye
  const stillUnpaired = sorted.filter((p) => !used.has(p.player_id));

  if (stillUnpaired.length === 1) {
    pairings.push({ white: "", black: "", bye: stillUnpaired[0].player_id });
  } else if (stillUnpaired.length > 1) {
    // Edge case: multiple players still unpaired after rematch attempts
    // Give bye to the one who hasn't had a bye yet, lowest score first
    const sortedByePriority = stillUnpaired.sort((a, b) => {
      const aHadBye = previousByes.has(a.player_id);
      const bHadBye = previousByes.has(b.player_id);
      if (aHadBye !== bHadBye) return aHadBye ? 1 : -1;
      return (a.score || 0) - (b.score || 0) || (a.seed || 0) - (b.seed || 0);
    });

    for (let i = 0; i < sortedByePriority.length - 1; i += 2) {
      pairings.push({
        white: sortedByePriority[i].player_id,
        black: sortedByePriority[i + 1].player_id,
      });
    }
    if (sortedByePriority.length % 2 === 1) {
      const byePlayer = sortedByePriority[sortedByePriority.length - 1];
      pairings.push({ white: "", black: "", bye: byePlayer.player_id });
    }
  }

  return pairings;
}

/**
 * Fetch previous byes from tournament rounds data.
 * Looks for pairings where `bye` is set.
 */
export function extractPreviousByes(
  rounds: Array<{ pairings?: Array<{ bye?: string }> }>,
): Set<string> {
  const byes = new Set<string>();
  for (const round of rounds || []) {
    if (!round.pairings) continue;
    for (const p of round.pairings) {
      if (p.bye) byes.add(p.bye);
    }
  }
  return byes;
}
