/**
 * System Jobs registry — single source of truth for every scheduled job
 * the platform runs (mirrors docker/crontab, which mirrors vercel.json).
 *
 * Used by:
 *   · /api/jobs/heartbeat  (cron-runner.sh posts run results here)
 *   · /api/admin/jobs      (admin panel "Jobs" tab reads health)
 *   · docker/cron-runner.sh (the runner itself is job-agnostic; it just
 *     posts the path + HTTP code + duration after each run)
 */

export interface JobDef {
  /** API path the cron hits (also the heartbeat key) */
  path: string;
  /** Human label in the admin UI */
  label: string;
  /** crontab expression (UTC), documentation only */
  schedule: string;
  /** how often the job should run, minutes (staleness guardrail) */
  intervalMin: number;
}

export const JOB_DEFS: JobDef[] = [
  { path: "/api/tournaments/cron", label: "Tournament engine", schedule: "*/5 * * * *", intervalMin: 5 },
  { path: "/api/battles/heal-stuck", label: "Heal stuck battles", schedule: "*/2 * * * *", intervalMin: 2 },
  { path: "/api/game/timeout", label: "Game timeouts", schedule: "* * * * *", intervalMin: 1 },
  { path: "/api/battles/challenge/cleanup-expired", label: "Clean expired challenges", schedule: "*/10 * * * *", intervalMin: 10 },
  { path: "/api/tournaments/reminder-check", label: "Tournament reminders", schedule: "30 13 * * *", intervalMin: 1440 },
  { path: "/api/tournaments/daily-create", label: "Daily tournament create", schedule: "0 0 * * 1", intervalMin: 10080 },
  { path: "/api/cron/refresh-fx", label: "FX rate refresh", schedule: "0 3 * * *", intervalMin: 1440 },
  { path: "/api/league/xp/settle", label: "League XP + payouts settle", schedule: "5 22 * * *", intervalMin: 1440 },
  { path: "/api/cron/revenue-sweep", label: "Weekly revenue sweep", schedule: "15 22 * * 0", intervalMin: 10080 },
  { path: "/api/cron/reconcile-payouts", label: "Reconcile payouts", schedule: "*/15 * * * *", intervalMin: 15 },
];

export interface JobStatus {
  path: string;
  label: string;
  schedule: string;
  intervalMin: number;
  lastRun: string | null;
  lastHttp: number | null;
  lastDurationMs: number | null;
  /** derived: healthy | failing | stale | never */
  health: "healthy" | "failing" | "stale" | "never";
}

export function sectionForJob(path: string): string {
  return `job:${path}`;
}

/** Derive health from the stored run record. */
export function deriveHealth(
  def: JobDef,
  lastRun: string | null,
  lastHttp: number | null
): JobStatus["health"] {
  if (!lastRun) return "never";
  if (lastHttp === 0 || (lastHttp && lastHttp >= 400)) return "failing";
  const ageMin = (Date.now() - new Date(lastRun).getTime()) / 60000;
  // allow 3x interval (or interval + 10 min for long-interval jobs) before
  // calling a job stale — weekly/daily jobs have jitter-tolerant windows
  const staleAfter = Math.max(def.intervalMin * 3, def.intervalMin + 10);
  if (ageMin > staleAfter) return "stale";
  return "healthy";
}
