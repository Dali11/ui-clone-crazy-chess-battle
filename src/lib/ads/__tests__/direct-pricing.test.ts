import { describe, it, expect } from "vitest";
import { adPriceForWeeks, adTiers, isSafeTargetUrl, validateDraft } from "../direct-pricing";

describe("adPriceForWeeks", () => {
  it("prices 1 week at base", () => {
    expect(adPriceForWeeks(1, 5000)).toBe(5000);
  });
  it("prices 2 weeks at 1.9x rounded to MK50", () => {
    expect(adPriceForWeeks(2, 5000)).toBe(9500);
  });
  it("prices 4 weeks at 3.5x rounded to MK50", () => {
    expect(adPriceForWeeks(4, 5000)).toBe(17500);
  });
  it("rounds odd bases to the nearest MK50", () => {
    // 2 * 3333 = 6332.7 → 6350? raw = round(6332.7/50)*50 = round(126.65)*50 = 127*50 = 6350
    expect(adPriceForWeeks(2, 3333)).toBe(6350);
  });
  it("rejects invalid durations", () => {
    expect(adPriceForWeeks(3, 5000)).toBe(0);
    expect(adPriceForWeeks(0, 5000)).toBe(0);
    expect(adPriceForWeeks(-1, 5000)).toBe(0);
  });
  it("never prices below MK50", () => {
    expect(adPriceForWeeks(1, 10)).toBe(50);
  });
});

describe("adTiers", () => {
  it("returns all three tiers", () => {
    expect(adTiers(5000)).toEqual([
      { weeks: 1, priceMwk: 5000 },
      { weeks: 2, priceMwk: 9500 },
      { weeks: 4, priceMwk: 17500 },
    ]);
  });
});

describe("isSafeTargetUrl", () => {
  it("accepts https and wa.me links", () => {
    expect(isSafeTargetUrl("https://example.com")).toBe(true);
    expect(isSafeTargetUrl("https://wa.me/265999123456")).toBe(true);
  });
  it("rejects http, javascript and garbage", () => {
    expect(isSafeTargetUrl("http://example.com")).toBe(false);
    expect(isSafeTargetUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeTargetUrl("not a url")).toBe(false);
    expect(isSafeTargetUrl("")).toBe(false);
  });
});

describe("validateDraft", () => {
  const valid = {
    business_name: "Chibondo Hardware",
    headline: "Wholesale building materials",
    target_url: "https://chibondo.example",
    weeks: 2,
  };
  it("accepts a valid draft", () => {
    expect(validateDraft(valid)).toBeNull();
  });
  it("accepts optional body and image when well-formed", () => {
    expect(validateDraft({ ...valid, body: "Short line", image_url: "https://img.example/b.png" })).toBeNull();
  });
  it("rejects bad headline, bad url, bad weeks", () => {
    expect(validateDraft({ ...valid, headline: "" })).toContain("Headline");
    expect(validateDraft({ ...valid, target_url: "http://x.example" })).toContain("https");
    expect(validateDraft({ ...valid, weeks: 3 })).toContain("1, 2 or 4");
    expect(validateDraft({ ...valid, headline: "x".repeat(61) })).toContain("60");
  });
});
