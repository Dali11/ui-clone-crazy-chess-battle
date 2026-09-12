import { describe, it, expect } from "vitest";
import {
  normalizePhone, findPhoneClusters, moveTimeStats, roboticVerdict,
  playerTimes, heldNote, isHeldNote,
} from "./detect";

describe("normalizePhone", () => {
  it("collapses local and international formats to the national number", () => {
    expect(normalizePhone("0999 123 456")).toBe("999123456");          // MW local
    expect(normalizePhone("+265 999 123 456")).toBe("999123456");      // MW intl
    expect(normalizePhone("097 123-4567")).toBe("971234567");         // ZM local
    expect(normalizePhone("+260 97 123-4567")).toBe("971234567");      // ZM intl
    expect(normalizePhone("+44 20 7946 0018")).toBe("442079460018");   // intl untouched
  });
  it("rejects junk", () => {
    expect(normalizePhone("abc")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("123456")).toBeNull(); // < 7 digits
  });
});

describe("findPhoneClusters", () => {
  const rows = [
    { userId: "a", phone: "0999123456", source: "deposit" as const },
    { userId: "b", phone: "+265 999 123 456", source: "deposit" as const },
    { userId: "b", phone: "0999123456", source: "withdrawal" as const },
    { userId: "c", phone: "0888123456", source: "deposit" as const }, // solo
  ];
  it("clusters two users on the same SIM", () => {
    const clusters = findPhoneClusters(rows);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].userIds).toEqual(["a", "b"]);
    expect(clusters[0].evidence["a"]).toEqual({ deposits: 1, withdrawals: 0 });
    expect(clusters[0].evidence["b"]).toEqual({ deposits: 1, withdrawals: 1 });
  });
  it("ignores single-user phones and nulls", () => {
    expect(findPhoneClusters([{ userId: "c", phone: "0888123456", source: "deposit" }])).toEqual([]);
    expect(findPhoneClusters([{ userId: "c", phone: null, source: "deposit" }])).toEqual([]);
    expect(findPhoneClusters([{ userId: "", phone: "0888123456", source: "deposit" }])).toEqual([]);
  });
  it("is deterministic regardless of input order", () => {
    const reversed = [...rows].reverse();
    expect(findPhoneClusters(reversed)[0].userIds).toEqual(["a", "b"]);
  });
});

describe("moveTimeStats + roboticVerdict", () => {
  it("stats on human-bursty times are not robotic", () => {
    const human = [300, 12000, 900, 250, 31000, 800, 400, 15000, 500, 2200, 600, 8000, 300, 700, 450, 12000, 500, 300, 2600, 900];
    const v = roboticVerdict(human);
    expect(v.flagged).toBe(false);
    expect(v.stats.n).toBe(20);
    expect(v.stats.cv).toBeGreaterThan(0.22);
  });
  it("flags a metronome engine at 1.2s", () => {
    const engine = Array.from({ length: 25 }, (_, i) => 1150 + (i % 5) * 12);
    const v = roboticVerdict(engine);
    expect(v.flagged).toBe(true);
    expect(v.severity).toBe("high");
    expect(v.stats.cv).toBeLessThan(0.22);
  });
  it("flags a metronome at 3.5s as medium (slower constant = laggy maybe)", () => {
    const slow = Array.from({ length: 25 }, (_, i) => 3400 + (i % 5) * 30);
    const v = roboticVerdict(slow);
    expect(v.flagged).toBe(true);
    expect(v.severity).toBe("medium");
  });
  it("constant but SLOW (bad connection) is NOT flagged", () => {
    const laggy = Array.from({ length: 25 }, () => 6000);
    const v = roboticVerdict(laggy);
    expect(v.flagged).toBe(false); // avg >= 4s
  });
  it("short games are never flagged", () => {
    const engine = Array.from({ length: 15 }, () => 1000);
    expect(roboticVerdict(engine).flagged).toBe(false);
  });
  it("stats handle empty/edge arrays", () => {
    expect(moveTimeStats([]).n).toBe(0);
    expect(roboticVerdict([]).flagged).toBe(false);
  });
  it("ignores absurd values (clock artifacts)", () => {
    const t = Array.from({ length: 20 }, (_, i) => (i === 0 ? 9_999_999_999 : 1200));
    expect(roboticVerdict(t).stats.n).toBe(19);
  });
});

describe("playerTimes", () => {
  const mt = [{ u: "w", ms: 100 }, { u: "b", ms: 200 }, { u: "w", ms: 300 }];
  it("filters by color", () => {
    expect(playerTimes(mt, "w")).toEqual([100, 300]);
    expect(playerTimes(mt, "b")).toEqual([200]);
    expect(playerTimes(null, "w")).toEqual([]);
  });
});

describe("held notes", () => {
  it("round-trips", () => {
    const note = heldNote(["shared_phone"]);
    expect(isHeldNote(note)).toBe(true);
    expect(isHeldNote("FX payout: 500 MWK")).toBe(false);
    expect(isHeldNote(null)).toBe(false);
    expect(isHeldNote(heldNote(["a", "b"]))).toBe(true);
  });
});
