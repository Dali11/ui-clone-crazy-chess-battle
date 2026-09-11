import { describe, it, expect } from "vitest";
import {
  throttled, dmPayload, groupPayload, turnPayload, challengeAcceptedPayload,
  opponentRecentlyActive, rulesFromConfig, TURN_ACTIVE_SUPPRESS_MS,
} from "../rules";

describe("push throttle rules", () => {
  it("no log entry = never throttled", () => {
    expect(throttled(null, 10)).toBe(false);
    expect(throttled(undefined, 10)).toBe(false);
  });

  it("recent send within gap = throttled", () => {
    const now = Date.now();
    expect(throttled(new Date(now - 2 * 60_000).toISOString(), 10, now)).toBe(true);
    expect(throttled(new Date(now - 11 * 60_000).toISOString(), 10, now)).toBe(false);
  });

  it("gap 0 = DMs always notify", () => {
    const now = Date.now();
    expect(throttled(new Date(now - 1000).toISOString(), 0, now)).toBe(false);
  });

  it("garbage timestamps don't throttle (fail open for DMs)", () => {
    expect(throttled("not-a-date", 10)).toBe(false);
  });

  it("rulesFromConfig falls back to defaults on bad values", () => {
    const r = rulesFromConfig({ dm_gap_min: "x", group_gap_min: -5, turn_gap_min: 7 });
    expect(r.dm_gap_min).toBe(0);
    expect(r.group_gap_min).toBe(10);
    expect(r.turn_gap_min).toBe(7);
    expect(rulesFromConfig(null)).toEqual({ dm_gap_min: 0, group_gap_min: 10, turn_gap_min: 5 });
  });
});

describe("payload builders", () => {
  it("dm payload deep-links to the sender and tags per-sender", () => {
    const p = dmPayload("Chibeks", "yo lets play", "uid1");
    expect(p.url).toBe("/chats/dm/uid1");
    expect(p.tag).toBe("dm-uid1");
    expect(p.title).toBe("Chibeks");
    expect(p.body).toBe("yo lets play");
  });

  it("dm payload previews long bodies and labels media", () => {
    const long = "word ".repeat(40);
    const p = dmPayload("u", long, "uid1");
    expect(p.body.length).toBeLessThanOrEqual(90);
    const media = dmPayload("u", "", "uid1");
    expect(media.body).toContain("message");
  });

  it("group payload tags per room and names the room", () => {
    const p = groupPayload("malawi", "Chibeks", "hello");
    expect(p.tag).toBe("group-malawi");
    expect(p.title).toContain("Malawi");
    expect(p.url).toBe("/chats/malawi");
  });

  it("turn payload deep-links to the game", () => {
    expect(turnPayload("g1", "Zeck").url).toBe("/game/g1");
    expect(turnPayload("g1", "Zeck").body).toContain("Zeck");
  });

  it("challenge payload links to dashboard", () => {
    expect(challengeAcceptedPayload("Maya").url).toBe("/dashboard");
  });
});

describe("active-player suppression", () => {
  it("recent heartbeat suppresses turn push", () => {
    const now = Date.now();
    expect(opponentRecentlyActive(new Date(now - 10_000).toISOString(), now)).toBe(true);
    expect(opponentRecentlyActive(new Date(now - TURN_ACTIVE_SUPPRESS_MS - 1000).toISOString(), now)).toBe(false);
    expect(opponentRecentlyActive(null, now)).toBe(false);
  });
});
