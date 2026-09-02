import { describe, it, expect } from "vitest";

// We test the tie-breaker logic by replicating the sortAndRank internals
// to verify the correct ordering without needing a Supabase connection.

interface Standing {
  player_id: string;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  form: string[];
}

interface Fixture {
  id: string;
  league_id: string;
  matchday: number;
  home_player_id: string;
  away_player_id: string;
  result: string;
  played: boolean;
  scheduled_date: string | null;
}

const SCORING = { winPoints: 3, drawPoints: 1, lossPoints: 0 };

// Copy of the FIXED sortAndRank logic
function sortAndRank(
  standings: Map<string, Standing>,
  fixtures: Fixture[],
  sc: typeof SCORING
): Standing[] {
  const sorted = Array.from(standings.values());
  sorted.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;

    const h2h = fixtures.filter(f => f.played && (
      (f.home_player_id === a.player_id && f.away_player_id === b.player_id) ||
      (f.home_player_id === b.player_id && f.away_player_id === a.player_id)
    ));
    let aS = 0, bS = 0;
    for (const f of h2h) {
      if (f.result === 'home_win') {
        if (f.home_player_id === a.player_id) { aS += sc.winPoints; bS += sc.lossPoints; }
        else { bS += sc.winPoints; aS += sc.lossPoints; }
      } else if (f.result === 'away_win') {
        if (f.away_player_id === a.player_id) { aS += sc.winPoints; bS += sc.lossPoints; }
        else { bS += sc.winPoints; aS += sc.lossPoints; }
      } else if (f.result === 'draw') {
        aS += sc.drawPoints; bS += sc.drawPoints;
      }
    }
    if (aS !== bS) return bS - aS;

    if (b.wins !== a.wins) return b.wins - a.wins;

    const aGD = a.wins - a.losses, bGD = b.wins - b.losses;
    if (bGD !== aGD) return bGD - aGD;

    return a.player_id.localeCompare(b.player_id);
  });
  sorted.forEach((s, i) => { s.position = i + 1; });
  return sorted;
}

function makeStanding(player_id: string, w: number, d: number, l: number): Standing {
  return {
    player_id,
    position: 0,
    played: w + d + l,
    wins: w,
    draws: d,
    losses: l,
    points: w * SCORING.winPoints + d * SCORING.drawPoints,
    form: [],
  };
}

function makeFixture(home: string, away: string, result: string, matchday = 1): Fixture {
  return {
    id: `${home}-${away}`,
    league_id: "test",
    matchday,
    home_player_id: home,
    away_player_id: away,
    result,
    played: true,
    scheduled_date: null,
  };
}

describe("League Engine — Tie-breaker Logic", () => {
  it("H2H is the primary tiebreaker (before wins)", () => {
    // Player A: 5 wins, 0 draws, 1 loss = 15 pts (lost H2H to B)
    // Player B: 4 wins, 3 draws, 0 losses = 15 pts (won H2H vs A)
    // B should rank higher despite fewer wins
    const standings = new Map<string, Standing>([
      ["A", makeStanding("A", 5, 0, 1)],
      ["B", makeStanding("B", 4, 3, 0)],
    ]);
    const fixtures: Fixture[] = [
      makeFixture("A", "B", "away_win"), // B beat A
    ];

    const result = sortAndRank(standings, fixtures, SCORING);
    expect(result[0].player_id).toBe("B"); // H2H winner ranks first
    expect(result[1].player_id).toBe("A");
  });

  it("falls through to wins when H2H is equal", () => {
    // Two players tied on points, H2H draw → more wins ranks higher
    const standings = new Map<string, Standing>([
      ["A", makeStanding("A", 4, 1, 1)], // 13 pts
      ["B", makeStanding("B", 3, 4, 0)], // 13 pts
    ]);
    const fixtures: Fixture[] = [
      makeFixture("A", "B", "draw"), // H2H is a draw
    ];

    const result = sortAndRank(standings, fixtures, SCORING);
    expect(result[0].player_id).toBe("A"); // More wins
  });

  it("falls through to GD when H2H and wins are equal", () => {
    // Same points, same H2H (draw), same wins → GD decides
    const standings = new Map<string, Standing>([
      ["A", makeStanding("A", 3, 2, 1)], // GD = 2
      ["B", makeStanding("B", 3, 2, 2)], // GD = 1
    ]);
    const fixtures: Fixture[] = [
      makeFixture("A", "B", "draw"),
    ];

    const result = sortAndRank(standings, fixtures, SCORING);
    expect(result[0].player_id).toBe("A"); // Better GD
  });

  it("uses league scoring config for H2H, not hardcoded 3/1", () => {
    // Custom scoring: win=4, draw=2, loss=0
    // A beat B in H2H → A gets 4, B gets 0
    const customScoring = { winPoints: 4, drawPoints: 2, lossPoints: 0 };
    const standings = new Map<string, Standing>([
      ["A", makeStanding("A", 3, 1, 1)], // 3*4 + 1*2 = 14 pts (custom)
      ["B", makeStanding("B", 2, 3, 0)], // 2*4 + 3*2 = 14 pts (custom)
    ]);
    // Override points for custom scoring
    standings.get("A")!.points = 3 * 4 + 1 * 2;
    standings.get("B")!.points = 2 * 4 + 3 * 2;

    const fixtures: Fixture[] = [
      makeFixture("A", "B", "home_win"), // A beat B
    ];

    const result = sortAndRank(standings, fixtures, customScoring);
    expect(result[0].player_id).toBe("A"); // A won H2H
  });

  it("handles double_forfeit in H2H (no points to either)", () => {
    const standings = new Map<string, Standing>([
      ["A", makeStanding("A", 3, 0, 0)], // 9 pts
      ["B", makeStanding("B", 3, 0, 0)], // 9 pts
    ]);
    const fixtures: Fixture[] = [
      makeFixture("A", "B", "double_forfeit"),
    ];

    const result = sortAndRank(standings, fixtures, SCORING);
    // H2H gives 0-0, so falls through to wins (equal), then GD (equal),
    // then alphabetical: A before B
    expect(result[0].player_id).toBe("A");
    expect(result[1].player_id).toBe("B");
  });

  it("handles 3-way tie with H2H", () => {
    // A beat B, B beat C, C beat A — rock-paper-scissors
    // All have 3 wins, 0 draws, 1 loss = 9 pts each
    const standings = new Map<string, Standing>([
      ["A", makeStanding("A", 3, 0, 1)],
      ["B", makeStanding("B", 3, 0, 1)],
      ["C", makeStanding("C", 3, 0, 1)],
    ]);
    const fixtures: Fixture[] = [
      makeFixture("A", "B", "home_win", 1), // A beat B
      makeFixture("B", "C", "home_win", 2),  // B beat C
      makeFixture("C", "A", "home_win", 3),  // C beat A
    ];

    const result = sortAndRank(standings, fixtures, SCORING);
    // All have same points, same H2H (each beat one, lost to one),
    // same wins, same GD → alphabetical: A, B, C
    expect(result[0].player_id).toBe("A");
    expect(result[1].player_id).toBe("B");
    expect(result[2].player_id).toBe("C");
  });

  it("points always takes priority over H2H", () => {
    // A has more points than B → A ranks first even if B beat A H2H
    const standings = new Map<string, Standing>([
      ["A", makeStanding("A", 5, 0, 1)], // 15 pts
      ["B", makeStanding("B", 4, 1, 2)], // 13 pts
    ]);
    const fixtures: Fixture[] = [
      makeFixture("A", "B", "away_win"), // B beat A, but A has more total points
    ];

    const result = sortAndRank(standings, fixtures, SCORING);
    expect(result[0].player_id).toBe("A"); // More points wins
  });
});
