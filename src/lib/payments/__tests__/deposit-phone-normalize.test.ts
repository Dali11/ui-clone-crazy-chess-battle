import { describe, it, expect } from "vitest";
import { normalizeDepositPhone, depositPhoneFormatHint, depositPhonePlaceholder } from "../deposit-phone-normalize";

describe("normalizeDepositPhone", () => {
  describe("Malawi (MW)", () => {
    it("accepts international +265 format and canonicalizes", () => {
      expect(normalizeDepositPhone("+265 991 23 45 67", "MW")).toEqual({ phone: "0991234567" });
    });
    it("accepts 265-prefix without +", () => {
      expect(normalizeDepositPhone("265888221108", "MW")).toEqual({ phone: "0888221108" });
    });
    it("accepts local 09 format as-is", () => {
      expect(normalizeDepositPhone("0991234567", "MW")).toEqual({ phone: "0991234567" });
    });
    it("accepts 9 digits with no leading 0 or country code", () => {
      expect(normalizeDepositPhone("991234567", "MW")).toEqual({ phone: "0991234567" });
    });
    it("rejects wrong-length numbers with a friendly error", () => {
      const r = normalizeDepositPhone("+2659912345678", "MW");
      expect(r.phone).toBe("");
      expect(r.error).toContain("Malawi");
    });
  });

  describe("Zambia (ZM)", () => {
    it("canonicalizes +260 international to local", () => {
      expect(normalizeDepositPhone("+260767430234", "ZM")).toEqual({ phone: "0767430234" });
    });
    it("keeps local format", () => {
      expect(normalizeDepositPhone("0979776070", "ZM")).toEqual({ phone: "0979776070" });
    });
    it("rejects a Malawi number passed as Zambian", () => {
      expect(normalizeDepositPhone("+265991234567", "ZM").phone).toBe("");
    });
  });

  describe("Kenya (KE)", () => {
    it("canonicalizes +254 to local", () => {
      expect(normalizeDepositPhone("+254712345678", "KE")).toEqual({ phone: "0712345678" });
    });
  });

  describe("other / unknown countries", () => {
    it("strips the plus and stores digits-only MSISDN", () => {
      expect(normalizeDepositPhone("+233201234567", "GH")).toEqual({ phone: "233201234567" });
      expect(normalizeDepositPhone("+233201234567", null)).toEqual({ phone: "233201234567" });
    });
    it("rejects too-short numbers", () => {
      expect(normalizeDepositPhone("12345", "GH").phone).toBe("");
    });
    it("rejects empty input", () => {
      expect(normalizeDepositPhone("   ", "MW").phone).toBe("");
      expect(normalizeDepositPhone("", "MW").error).toContain("Enter");
    });
  });

  it("is idempotent: normalizing an already-canonical number changes nothing", () => {
    const once = normalizeDepositPhone("+265 991 23 45 67", "MW");
    const twice = normalizeDepositPhone(once.phone, "MW");
    expect(twice.phone).toBe(once.phone);
  });
});

describe("format hint + placeholder helpers", () => {
  it("gives a Malawi rule notice", () => {
    expect(depositPhoneFormatHint("MW")).toContain("0991234567");
    expect(depositPhoneFormatHint("MW")).toContain("+265");
  });
  it("gives a Zambia rule notice", () => {
    expect(depositPhoneFormatHint("ZM")).toContain("0761234567");
    expect(depositPhonePlaceholder("ZM")).toBe("e.g. 0761234567");
  });
  it("falls back to country-code instructions for other countries", () => {
    expect(depositPhoneFormatHint("GH")).toContain("country code");
    expect(depositPhonePlaceholder(null)).toContain("+");
  });
});
