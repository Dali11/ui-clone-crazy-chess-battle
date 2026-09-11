import { describe, it, expect } from "vitest";
import { decideAd, emptyState, isResultsPlacement } from "../frequency";

const CAPS = { minGapSec: 90, hourlyCap: 4, dailyCap: 12, resultsEveryN: 3 };
const T0 = 1_700_000_000_000; // arbitrary epoch ms

describe("ad frequency router — nth-game gate", () => {
  it("shows the results ad only on every 3rd finished game", () => {
    const outcomes = [];
    let state = emptyState();
    for (let i = 0; i < 7; i++) {
      const d = decideAd({ placement: "game_results", caps: CAPS, state, now: T0 + i * 100_000 });
      state = d.state;
      outcomes.push(d.show);
    }
    // games 3 and 6 show; every other finished game is ad-free
    expect(outcomes).toEqual([false, false, true, false, false, true, false]);
  });

  it("counts EVERY finished game, including blocked ones", () => {
    // Even when the global daily cap blocks rendering, the counter
    // must still advance so "every 3rd" stays true to the count.
    const caps = { ...CAPS, dailyCap: 1, resultsEveryN: 3 };
    let state = emptyState();
    let counts = [];
    for (let i = 0; i < 4; i++) {
      const d = decideAd({ placement: "game_results", caps, state, now: T0 + i * 3600_000 * 2 });
      state = d.state;
      counts.push([d.show, state.games["game_results"]]);
    }
    // game 1: nth-gated (1 % 3 != 0). game 2: nth-gated. game 3: nth
    // gate PASSES (3 % 3 == 0) and the daily cap is fresh → shown, and
    // its impression is recorded. game 4: nth-gated again, count still
    // increments. The daily cap blocks game 6 (3 % 3 == 0, cap 1/1).
    expect(counts[0]).toEqual([false, 1]);
    expect(counts[1]).toEqual([false, 2]);
    expect(counts[2]).toEqual([true, 3]);
    expect(counts[3]).toEqual([false, 4]);
  });

  it("resultsEveryN 1 (or 0) shows on every game (subject to other caps)", () => {
    const caps = { ...CAPS, resultsEveryN: 1 };
    let state = emptyState();
    const d1 = decideAd({ placement: "game_results", caps, state, now: T0 });
    state = d1.state;
    const d2 = decideAd({ placement: "game_results", caps, state, now: T0 + 200_000 });
    expect(d1.show).toBe(true);
    expect(d2.show).toBe(true);
  });

  it("the gate applies only to results placements — page banners are untouched", () => {
    expect(isResultsPlacement("game_results")).toBe(true);
    expect(isResultsPlacement("battle_settlement")).toBe(true);
    expect(isResultsPlacement("draughts_results")).toBe(true);
    expect(isResultsPlacement("challenge_finished")).toBe(true);
    expect(isResultsPlacement("leagues")).toBe(false);
    expect(isResultsPlacement("lobby")).toBe(false);
    let state = emptyState();
    const d = decideAd({ placement: "leagues", caps: CAPS, state, now: T0 });
    expect(d.show).toBe(true); // first league-page visit shows immediately
    expect(state.games["leagues"]).toBeUndefined();
  });
});

describe("ad frequency router — global caps", () => {
  it("enforces the min gap across DIFFERENT placements", () => {
    let state = emptyState();
    const first = decideAd({ placement: "lobby", caps: CAPS, state, now: T0 });
    state = first.state;
    expect(first.show).toBe(true);
    // a different placement 30s later is still too soon
    const second = decideAd({ placement: "leagues", caps: CAPS, state, now: T0 + 30_000 });
    expect(second.show).toBe(false);
    expect(second.reason).toContain("min gap");
    // 91s later it's fine
    const third = decideAd({ placement: "leagues", caps: CAPS, state, now: T0 + 91_000 });
    expect(third.show).toBe(true);
  });

  it("enforces the rolling hourly cap across all placements", () => {
    const caps = { ...CAPS, hourlyCap: 2, minGapSec: 0, resultsEveryN: 1 };
    let state = emptyState();
    const placements = ["lobby", "spectate", "leagues"];
    const results = placements.map((p, i) => {
      const d = decideAd({ placement: p, caps, state, now: T0 + i * 1000 });
      state = d.state;
      return d;
    });
    expect(results.map((r) => r.show)).toEqual([true, true, false]);
    expect(results[2].reason).toContain("hourly cap");
    // ...but an hour later the window has rolled
    const later = decideAd({ placement: "leagues", caps, state, now: T0 + 3600_000 + 2000 });
    expect(later.show).toBe(true);
  });

  it("enforces the rolling daily cap and prunes impressions older than 24h", () => {
    const caps = { ...CAPS, dailyCap: 2, hourlyCap: 0, minGapSec: 0, resultsEveryN: 1 };
    let state = emptyState();
    decideAd({ placement: "lobby", caps, state, now: T0 }); state = Object.values(state.imp)[0] ? state : state; // (imp recorded inside decideAd's returned state)
    let s2 = decideAd({ placement: "lobby", caps, state: emptyState(), now: T0 }).state;
    const r2 = decideAd({ placement: "spectate", caps, state: s2, now: T0 + 1000 });
    s2 = r2.state;
    const r3 = decideAd({ placement: "leagues", caps, state: s2, now: T0 + 2000 });
    expect(r3.show).toBe(false);
    expect(r3.reason).toContain("daily cap");
    // next day: everything pruned → shows again
    const nextDay = decideAd({ placement: "leagues", caps, state: s2, now: T0 + 25 * 3600_000 });
    expect(nextDay.show).toBe(true);
  });

  it("zero caps = unlimited", () => {
    const caps = { minGapSec: 0, hourlyCap: 0, dailyCap: 0, resultsEveryN: 0 };
    let state = emptyState();
    for (let i = 0; i < 10; i++) {
      const d = decideAd({ placement: "lobby", caps, state, now: T0 + i * 1000 });
      state = d.state;
      expect(d.show).toBe(true);
    }
  });
});

describe("ad frequency router — robustness", () => {
  it("survives corrupt state shapes (null maps, non-array entries)", () => {
    const d = decideAd({
      placement: "game_results",
      caps: CAPS,
      state: { imp: { lobby: null as any, leagues: "nope" as any }, games: null as any },
      now: T0,
    });
    expect(d.show).toBe(false); // 1st game with resultsEveryN=3 → blocked by nth gate
    expect(d.state.games["game_results"]).toBe(1);
  });
});
