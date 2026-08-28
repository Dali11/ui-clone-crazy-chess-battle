"use client";

import { useEffect, useRef } from "react";

/**
 * Client-side cron heartbeat.
 *
 * Vercel Hobby plan only allows daily cron jobs — not the 5-minute
 * cadence the tournament system needs (no-show auto-resign, clock
 * timeouts, arena matchmaking). Instead of relying on an external
 * service (cron-job.org, Base44 workflows), we piggyback on the one
 * thing that's always present when the cron is needed: real players
 * with pages open.
 *
 * Every browser that has the site open fires a GET to the tournament
 * cron endpoint every 5 minutes. If 20 players are online, the endpoint
 * gets hit ~20 times per 5-min window — but the logic is idempotent
 * (safe to call repeatedly), and the redundant calls just return
 * {"started":0,"noShowResigned":0,...} which is nearly free.
 *
 * When nobody's online, there are no active games to time out, so
 * there's no need to run the cron at all.
 *
 * This keeps all scheduling logic inside the codebase — no external
 * dependency, no plan limits, nothing to break at 3am.
 */
const CRON_URL = "/api/tournaments/cron";
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export default function CronHeartbeat() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Only run in the browser, and only on secure pages (avoid
    // firing during SSR or on error pages).
    if (typeof window === "undefined") return;

    const ping = () => {
      fetch(CRON_URL, { method: "GET" }).catch(() => {
        // Silent fail — this is a best-effort trigger, not a
        // user-facing action. Network errors just mean the next
        // interval will try again.
      });
    };

    // Fire once on mount (covers page loads during active
    // tournaments where the last cron might have been minutes ago)
    ping();

    // Then every 5 minutes while the page stays open
    timerRef.current = setInterval(ping, INTERVAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return null;
}
