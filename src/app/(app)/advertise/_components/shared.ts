// Shared types + helpers for the advertise panel tabs.

export interface Campaign {
  id: string;
  business_name: string;
  headline: string;
  body: string | null;
  image_url: string | null;
  target_url: string;
  weeks: number;
  price_mwk: number;
  target_country: string | null;
  target_gender: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  impressions: number;
  clicks: number;
  reject_reason: string | null;
  created_at: string;
}

export const COUNTRY_LABELS: Record<string, string> = {
  MW: "Malawi",
  ZM: "Zambia",
  KE: "Kenya",
};

/** Short audience description for a campaign, e.g. "MW · male" or "Everyone". */
export function audienceLabel(c: string | null, g: string | null): string {
  const parts: string[] = [];
  if (c) parts.push(COUNTRY_LABELS[c] || c);
  if (g === "male") parts.push("Men");
  if (g === "female") parts.push("Women");
  return parts.length ? parts.join(" · ") : "Everyone";
}

/** Human ratio label: 1200x628 -> "1.91:1". Squares show "1:1" exactly. */
export function ratioLabel(w: number, h: number): string {
  const g = (a: number, b: number): number => (b === 0 ? a : g(b, a % b));
  const d = g(w, h) || 1;
  const rw = Math.round(w / d);
  const rh = Math.round(h / d);
  if (rw <= 40 && rh <= 40) return `${rw}:${rh}`;
  return `${(w / h).toFixed(2)}:1`;
}

export const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending_review: { label: "In review", cls: "bg-yellow-500/15 text-yellow-500" },
  active: { label: "Live", cls: "bg-emerald-500/15 text-emerald-500" },
  paused: { label: "Paused", cls: "bg-orange-500/15 text-orange-500" },
  rejected: { label: "Not approved", cls: "bg-red-500/15 text-red-500" },
  ended: { label: "Finished", cls: "bg-ccb-muted/15 text-ccb-muted" },
  refunded: { label: "Refunded", cls: "bg-ccb-muted/15 text-ccb-muted" },
};

/** Click-through rate as a percentage string. */
export function ctr(clicks: number, impressions: number): string {
  if (!impressions) return "—";
  return `${((clicks / impressions) * 100).toFixed(1)}%`;
}

export interface AudienceStats {
  total: number;
  countries: Record<string, { total: number; male: number; female: number }>;
}

/** Estimated reach for a country+gender pairing, as a human sentence. */
export function reachSentence(
  audience: AudienceStats,
  targetCountry: string,
  targetGender: string
): string {
  const all = audience.total;
  if (!targetCountry && !targetGender) return `Reaches all ${all.toLocaleString()} players.`;
  const c = targetCountry
    ? audience.countries[targetCountry] || { total: 0, male: 0, female: 0 }
    : null;
  if (targetCountry && targetGender) {
    const n = targetGender === "male" ? c!.male : c!.female;
    return `Reaches ~${n.toLocaleString()} ${targetGender === "male" ? "men" : "women"} who play in ${COUNTRY_LABELS[targetCountry]} (players who haven't set their gender in Settings never see gender-targeted ads — consider leaving gender on "All" to reach the full country).`;
  }
  if (targetCountry)
    return `Reaches ~${c!.total.toLocaleString()} players in ${COUNTRY_LABELS[targetCountry]} (of ${all.toLocaleString()} total).`;
  const male = Object.values(audience.countries).reduce((a, x) => a + x.male, 0);
  const female = Object.values(audience.countries).reduce((a, x) => a + x.female, 0);
  return `Reaches ~${(targetGender === "male" ? male : female).toLocaleString()} players who have set their gender (of ${all.toLocaleString()} total).`;
}
