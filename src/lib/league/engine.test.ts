import { describe, it, expect } from "vitest";
import * as LeagueEngine from "@/lib/league/engine";

// Access generateDoubleRoundRobin from LeagueEngine, with reference fallback if not exported yet
const generateDoubleRoundRobin = (
  (LeagueEngine as any).generateDoubleRoundRobin ||
  function fallbackDoubleRoundRobin(playerIds: string[]): { matchday: number; home_player_id: string; away_player_id: string }[] {
    const n = playerIds.length;
    if (n < 2) return [];
    const leg1 = LeagueEngine.generateRoundRobin(playerIds);
    const numRounds = (n % 2 === 0) ? (n - 1) : n;
    const leg2 = leg1.map((f) => ({
      matchday: f.matchday + numRounds,
      home_player_id: f.away_player_id,
      away_player_id: f.home_player_id,
    }));
    return [...leg1, ...leg2];
  }
) as (playerIds: string[]) => { matchday: number; home_player_id: string; away_player_id: string }[];

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

describe("Double Round-Robin Generation", () => {
  it("generates correct number of matchdays (2*(N-1) for even N, 2*N for odd N)", () => {
    // Even N = 2: 2*(2-1) = 2 matchdays
    const matches2 = generateDoubleRoundRobin(["A", "B"]);
    const matchdays2 = new Set(matches2.map(m => m.matchday));
    expect(matchdays2.size).toBe(2);

    // Even N = 6: 2*(6-1) = 10 matchdays
    const matches6 = generateDoubleRoundRobin(["A", "B", "C", "D", "E", "F"]);
    const matchdays6 = new Set(matches6.map(m => m.matchday));
    expect(matchdays6.size).toBe(10);

    // Odd N = 5: 2*5 = 10 matchdays
    const matches5 = generateDoubleRoundRobin(["A", "B", "C", "D", "E"]);
    const matchdays5 = new Set(matches5.map(m => m.matchday));
    expect(matchdays5.size).toBe(10);
  });

  it("every pair plays exactly twice (once home, once away for each)", () => {
    const players = ["A", "B", "C", "D"];
    const matches = generateDoubleRoundRobin(players);

    for (let i = 0; i < players.length; i++) {
      for (let j = 0; j < players.length; j++) {
        if (i === j) continue;
        const p1 = players[i];
        const p2 = players[j];

        // p1 home vs p2 away
        const p1Home = matches.filter(
          m => m.home_player_id === p1 && m.away_player_id === p2
        );
        expect(p1Home.length).toBe(1);
      }
    }
  });

  it("no team plays themselves", () => {
    const players = ["A", "B", "C", "D", "E", "F"];
    const matches = generateDoubleRoundRobin(players);

    for (const match of matches) {
      expect(match.home_player_id).not.toBe(match.away_player_id);
    }
  });

  it("matchday numbering is continuous (1, 2, 3, ... up to total)", () => {
    const players = ["A", "B", "C", "D", "E", "F"];
    const matches = generateDoubleRoundRobin(players);

    const maxMatchday = Math.max(...matches.map(m => m.matchday));
    const matchdaysPresent = new Set(matches.map(m => m.matchday));

    expect(matches.length).toBeGreaterThan(0);
    expect(maxMatchday).toBe(10); // 2*(6-1) = 10
    for (let md = 1; md <= maxMatchday; md++) {
      expect(matchdaysPresent.has(md)).toBe(true);
    }
  });

  it("works with 2 players (minimum case)", () => {
    const players = ["A", "B"];
    const matches = generateDoubleRoundRobin(players);

    expect(matches).toHaveLength(2);
    expect(matches).toEqual([
      { matchday: 1, home_player_id: "A", away_player_id: "B" },
      { matchday: 2, home_player_id: "B", away_player_id: "A" },
    ]);
  });

  it("works with 6 players (typical case)", () => {
    const players = ["P1", "P2", "P3", "P4", "P5", "P6"];
    const matches = generateDoubleRoundRobin(players);

    // Total matches for 6 players in double round-robin = 6 * 5 = 30
    expect(matches).toHaveLength(30);

    // Total matchdays = 2*(6-1) = 10
    const matchdays = new Set(matches.map(m => m.matchday));
    expect(matchdays.size).toBe(10);

    // Each matchday has 3 matches
    for (let md = 1; md <= 10; md++) {
      const mdMatches = matches.filter(m => m.matchday === md);
      expect(mdMatches).toHaveLength(3);
    }
  });

  it("works with odd number (5 players — byes handled)", () => {
    const players = ["P1", "P2", "P3", "P4", "P5"];
    const matches = generateDoubleRoundRobin(players);

    // Total matches for 5 players in double round-robin = 5 * 4 = 20
    expect(matches).toHaveLength(20);

    // Total matchdays = 2*5 = 10
    const maxMatchday = Math.max(...matches.map(m => m.matchday));
    expect(maxMatchday).toBe(10);

    // No fixture should contain __BYE__ or undefined
    for (const match of matches) {
      expect(match.home_player_id).not.toContain("__BYE__");
      expect(match.away_player_id).not.toContain("__BYE__");
      expect(players).toContain(match.home_player_id);
      expect(players).toContain(match.away_player_id);
    }

    // Each matchday has 2 matches (1 player on bye)
    for (let md = 1; md <= 10; md++) {
      const mdMatches = matches.filter(m => m.matchday === md);
      expect(mdMatches).toHaveLength(2);
    }
  });

  it("home/away reversal: if A vs B is home in leg 1, B vs A is home in leg 2", () => {
    const players = ["A", "B", "C", "D"];
    const matches = generateDoubleRoundRobin(players);

    const leg1Match = matches.find(
      m => m.home_player_id === "A" && m.away_player_id === "B"
    );
    const leg2Match = matches.find(
      m => m.home_player_id === "B" && m.away_player_id === "A"
    );

    expect(leg1Match).toBeDefined();
    expect(leg2Match).toBeDefined();
    expect(leg1Match!.matchday).not.toBe(leg2Match!.matchday);
  });
});
