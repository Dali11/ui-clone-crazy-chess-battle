/**
 * Pure anti-cheat detection helpers (no I/O — fully testable).
 *
 * Phase 1 covers two signal families:
 *  1. shared_phone  — two or more accounts funding/cashing out from the
 *     SAME mobile money number (deposits.phone / withdrawals.phone). A
 *     mobile money number IS a person's SIM: sharing it across accounts
 *     is near-certain alt-account / farming evidence.
 *  2. robotic_move_times — per-move think times with implausibly low
 *     variance. Humans have bursty rhythm (instant recaptures, long
 *     thinks); engines answer in metronome time.
 *
 * These signals are ADVISORY: they raise admin-visible flags and hold
 * payouts; nothing auto-bans. False positives are cheap to dismiss.
 */

// ── Phone normalization ────────────────────────────────────────────────

/**
 * Normalize to the 9-digit NATIONAL number so local (0999123456) and
 * international (+265999123456) formats of the same SIM compare equal.
 *  - 0XXXXXXXXX (10 digits, local)  -> last 9
 *  - 26X+9 digits (12, +265/+260 international) -> last 9
 *  - anything else: digits as-is (>= 7 digits required)
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D+/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith("26")) return digits.slice(3);
  return digits.length >= 7 ? digits : null;
}

export interface PhoneRow {
  userId: string;
  phone: string | null | undefined;
  /** where the phone came from — 'deposit' | 'withdrawal' */
  source: "deposit" | "withdrawal";
}

export interface PhoneCluster {
  /** normalized shared phone */
  phone: string;
  /** distinct user ids sharing this phone (>= 2) */
  userIds: string[];
  /** per-user: how many rows from each source */
  evidence: Record<string, { deposits: number; withdrawals: number }>;
}

/**
 * Group phone-bearing rows into clusters of 2+ DISTINCT users.
 * Deterministic: clusters and user ids are sorted.
 */
export function findPhoneClusters(rows: PhoneRow[]): PhoneCluster[] {
  const byPhone = new Map<string, Map<string, { deposits: number; withdrawals: number }>>();
  for (const r of rows) {
    const phone = normalizePhone(r.phone);
    if (!phone || !r.userId) continue;
    let users = byPhone.get(phone);
    if (!users) { users = new Map(); byPhone.set(phone, users); }
    const ev = users.get(r.userId) ?? { deposits: 0, withdrawals: 0 };
    if (r.source === "deposit") ev.deposits++; else ev.withdrawals++;
    users.set(r.userId, ev);
  }
  const clusters: PhoneCluster[] = [];
  for (const [phone, users] of byPhone) {
    if (users.size < 2) continue;
    const userIds = Array.from(users.keys()).sort();
    const evidence: PhoneCluster["evidence"] = {};
    for (const [uid, ev] of users) evidence[uid] = ev;
    clusters.push({ phone, userIds, evidence });
  }
  // busiest clusters first (most money-linked rows)
  clusters.sort((a, b) => b.userIds.length - a.userIds.length || b.phone.localeCompare(a.phone));
  return clusters;
}

// ── Move-time (robotic rhythm) analysis ────────────────────────────────

export interface MoveTimeStats {
  n: number;
  avgMs: number;
  stdDevMs: number;
  /** coefficient of variation (stdDev / avg). Human play: > 0.5. */
  cv: number;
}

/** Population stats over an array of think times in ms. */
export function moveTimeStats(times: number[]): MoveTimeStats {
  const clean = times.filter((t) => typeof t === "number" && t >= 0 && t <= 3_600_000);
  const n = clean.length;
  if (n === 0) return { n: 0, avgMs: 0, stdDevMs: 0, cv: 1 };
  const sum = clean.reduce((s, t) => s + t, 0);
  const avgMs = sum / n;
  if (n === 1) return { n, avgMs, stdDevMs: 0, cv: 0 };
  const variance = clean.reduce((s, t) => s + (t - avgMs) ** 2, 0) / n;
  const stdDevMs = Math.sqrt(variance);
  return { n, avgMs, stdDevMs, cv: avgMs > 0 ? stdDevMs / avgMs : 1 };
}

export const ROBOTIC_THRESHOLDS = {
  /** minimum moves on ONE game before rhythm analysis is meaningful */
  minMoves: 20,
  /** cv below this = metronome rhythm (humans sit > 0.5 almost always) */
  maxCv: 0.22,
  /** avg think time also below this => engine-like speed AND rhythm */
  fastAvgMs: 4000,
} as const;

export interface RoboticVerdict {
  flagged: boolean;
  severity: "medium" | "high" | null;
  reason: string | null;
  stats: MoveTimeStats;
}

/**
 * Detect robotic move rhythm for ONE player's think times in ONE game.
 * Conservative on purpose (advisory signal, admin reviews):
 *  - n >= 20 moves, AND
 *  - cv < 0.22 (near-constant think time), AND
 *  - avg < 4s (metronome FAST; slow constant times are often a laggy
 *    connection, which is human and common on mobile data).
 */
export function roboticVerdict(times: number[]): RoboticVerdict {
  const stats = moveTimeStats(times);
  const { minMoves, maxCv, fastAvgMs } = ROBOTIC_THRESHOLDS;
  if (stats.n >= minMoves && stats.cv < maxCv && stats.avgMs < fastAvgMs) {
    // very fast + metronome => strong engine signal
    const severity: "medium" | "high" = stats.avgMs < 1500 ? "high" : "medium";
    return {
      flagged: true,
      severity,
      reason: `metronome rhythm: ${(stats.avgMs / 1000).toFixed(1)}s avg ±${(stats.stdDevMs / 1000).toFixed(1)}s (cv ${stats.cv.toFixed(2)}) over ${stats.n} moves`,
      stats,
    };
  }
  return { flagged: false, severity: null, reason: null, stats };
}

/** Extract one player's think times from a games.move_times array. */
export function playerTimes(
  moveTimes: { u: string; ms: number }[] | null | undefined,
  color: "w" | "b",
): number[] {
  if (!Array.isArray(moveTimes)) return [];
  return moveTimes.filter((m) => m && m.u === color && typeof m.ms === "number").map((m) => m.ms);
}

// ── Flag bookkeeping helpers ───────────────────────────────────────────

export const HELD_NOTE_PREFIX = "HELD: integrity review";

/** Admin note written onto a held (status='pending') league payout. */
export function heldNote(flagTypes: string[]): string {
  return `${HELD_NOTE_PREFIX} (${flagTypes.join(", ")})`;
}

export function isHeldNote(note: string | null | undefined): boolean {
  return !!note && note.startsWith(HELD_NOTE_PREFIX);
}

/** Human labels for flag types (admin UI). */
export const FLAG_TYPE_LABELS: Record<string, string> = {
  shared_phone: "Shared payment phone (possible alt accounts)",
  robotic_move_times: "Robotic move rhythm (possible engine)",
};

export function flagTypeLabel(type: string): string {
  return FLAG_TYPE_LABELS[type] ?? type;
}
