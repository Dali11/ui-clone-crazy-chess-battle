import { describe, it, expect } from "vitest";
import { toMalawiLocalMsisdn } from "../malawi-phone";

describe("toMalawiLocalMsisdn", () => {
  it("canonicalizes international +265 format", () => {
    expect(toMalawiLocalMsisdn("+265996942145")).toBe("0996942145");
  });

  it("canonicalizes 265-prefix without +", () => {
    expect(toMalawiLocalMsisdn("265888221108")).toBe("0888221108");
  });

  it("keeps local format as-is (already canonical)", () => {
    expect(toMalawiLocalMsisdn("0991234567")).toBe("0991234567");
    expect(toMalawiLocalMsisdn("0888221108")).toBe("0888221108");
  });

  it("strips spaces and separators", () => {
    expect(toMalawiLocalMsisdn("+265 991 23 45 67")).toBe("0991234567");
    expect(toMalawiLocalMsisdn("09-91-234-567")).toBe("0991234567");
  });

  it("rejects wrong lengths", () => {
    expect(toMalawiLocalMsisdn("09912")).toBeNull();
    expect(toMalawiLocalMsisdn("+2659912345678")).toBeNull(); // too many digits
    expect(toMalawiLocalMsisdn("")).toBeNull();
    expect(toMalawiLocalMsisdn(null)).toBeNull();
  });

  it("rejects non-mobile prefixes (not 08/09)", () => {
    expect(toMalawiLocalMsisdn("012345678")).toBeNull(); // 01 is not a MW mobile prefix
  });
});
