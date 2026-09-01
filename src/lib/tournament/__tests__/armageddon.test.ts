import { describe, it, expect } from "vitest";
import { resolveArmageddonResult } from "@/lib/tournament/armageddon";

describe("resolveArmageddonResult", () => {
  it("returns white when white wins by checkmate", () => {
    expect(resolveArmageddonResult("checkmate", "white")).toBe("white");
  });

  it("returns black when black wins by checkmate", () => {
    expect(resolveArmageddonResult("checkmate", "black")).toBe("black");
  });

  it("returns white when opponent resigns as black", () => {
    expect(resolveArmageddonResult("resign", "white")).toBe("white");
  });

  it("returns black when opponent resigns as white", () => {
    expect(resolveArmageddonResult("resign", "black")).toBe("black");
  });

  it("returns black when opponent times out as white", () => {
    expect(resolveArmageddonResult("timeout", "black")).toBe("black");
  });

  it("returns black on draw (draw odds for Black)", () => {
    expect(resolveArmageddonResult("draw", null)).toBe("black");
  });

  it("returns black on stalemate (draw odds for Black)", () => {
    expect(resolveArmageddonResult("stalemate", null)).toBe("black");
  });

  it("returns black when winner is null regardless of status", () => {
    expect(resolveArmageddonResult("draw", null)).toBe("black");
    expect(resolveArmageddonResult("stalemate", null)).toBe("black");
    expect(resolveArmageddonResult("any_status", null)).toBe("black");
  });

  it("returns black when winner is 'draw' string (from GameResult type)", () => {
    expect(resolveArmageddonResult("draw", "draw")).toBe("black");
  });
});
