/**
 * Affiliate shared display helpers — used by the section's subpage clients
 * so labels and date formatting stay consistent everywhere.
 */

export const ACTIVATION_LABELS: Record<string, string> = {
  chess_battle: "Played a cash battle",
  tournament_joined: "Joined a tournament",
  wallet_topup: "Topped up wallet",
  "10_quick_matches": "Played 10 quick matches",
  membership_purchase: "Purchased membership",
  fee_share: "Generating platform fees",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Deterministic "19 Sep" formatting (UTC, fixed month names) — no hydration drift. */
export function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] || ""}`;
}

/** "Jan 2026" for month headings (UTC). */
export function monthHeading(ym: string): string {
  const [y, m] = ym.split("-");
  return `${MONTHS[Number(m) - 1] || m} ${y}`;
}

/** Group ledger entries by YYYY-MM, newest month first. */
export function groupByMonth<T extends { created_at: string }>(entries: T[]): { ym: string; entries: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const e of entries) {
    const ym = e.created_at.slice(0, 7);
    if (!groups.has(ym)) groups.set(ym, []);
    groups.get(ym)!.push(e);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([ym, list]) => ({ ym, entries: list }));
}

/** The share URL for a referral code. */
export function referralLink(baseUrl: string, refCode: string): string {
  return `${baseUrl}/signup?ref=${encodeURIComponent(refCode)}`;
}
