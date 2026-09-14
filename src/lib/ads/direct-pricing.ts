/**
 * Direct-ad campaign pricing — pure, shared by API + /advertise UI.
 * Flat weekly rate: 1 week = base, 2 weeks = 1.9x, 4 weeks = 3.5x,
 * rounded to the nearest MK50 so prices stay clean for mobile money.
 */

export const AD_WEEK_OPTIONS = [1, 2, 4] as const;
export type AdWeeks = (typeof AD_WEEK_OPTIONS)[number];

export function adPriceForWeeks(weeks: number, basePerWeekMwk: number): number {
  if (!AD_WEEK_OPTIONS.includes(weeks as AdWeeks)) return 0;
  const multiplier = weeks === 1 ? 1 : weeks === 2 ? 1.9 : 3.5;
  const raw = Math.round((basePerWeekMwk * multiplier) / 50) * 50;
  return Math.max(50, raw);
}

/** All purchasable tiers as (weeks, price) pairs. */
export function adTiers(basePerWeekMwk: number): { weeks: AdWeeks; priceMwk: number }[] {
  return AD_WEEK_OPTIONS.map((w) => ({ weeks: w, priceMwk: adPriceForWeeks(w, basePerWeekMwk) }));
}

/** https-only URLs; wa.me links are https and fine. */
export function isSafeTargetUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export interface CampaignDraft {
  business_name: string;
  headline: string;
  body?: string | null;
  image_url?: string | null;
  target_url: string;
  weeks: number;
}

/** Server-side validation — same rules the UI hints at. */
export function validateDraft(d: Partial<CampaignDraft>): string | null {
  if (!d.business_name || d.business_name.trim().length < 1 || d.business_name.length > 60)
    return "Business name must be 1-60 characters";
  if (!d.headline || d.headline.trim().length < 1 || d.headline.length > 60)
    return "Headline must be 1-60 characters";
  if (d.body && d.body.length > 120) return "Body text must be at most 120 characters";
  if (d.image_url && !isSafeTargetUrl(d.image_url)) return "Image URL must be https";
  if (!d.target_url || !isSafeTargetUrl(d.target_url)) return "Destination link must be a valid https URL";
  if (!AD_WEEK_OPTIONS.includes((d.weeks ?? 0) as AdWeeks)) return "Choose 1, 2 or 4 weeks";
  return null;
}
