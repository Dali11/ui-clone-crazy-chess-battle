// Push delivery — Web Push (VAPID) to players' subscribed devices.
// Fire-and-forget by design: callers never let push failures break the
// parent action (a message must send even if push fails).

import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { throttled, rulesFromConfig, type PushPayload, type PushRules } from "./rules";
import { getPlatformConfig } from "@/lib/platform-config";

let configured = false;
function ensureVapid() {
  if (configured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:admin@crazychessbattles.live";
  if (!publicKey || !privateKey) throw new Error("VAPID keys missing");
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export function pushConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

interface SubRow {
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const CONCURRENCY = 25;
const MAX_SUBS_PER_SEND = 1000;

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Send `payload` to every subscribed device of the given users, honouring
 * per-user throttle keys and the admin push kill switch. Never throws.
 * Returns how many device notifications were sent.
 */
export async function sendPushToUsers(
  admin: SupabaseClient,
  userIds: string[],
  payload: PushPayload,
  opts: { notifKey: string; gapMin?: number; rules?: PushRules; nowMs?: number }
): Promise<number> {
  const nowMs = opts.nowMs ?? Date.now();
  if (!userIds.length) return 0;
  try {
    // Admin kill switch + configured gaps
    let cfg: Record<string, any> | null = null;
    try { cfg = await getPlatformConfig(admin, "push"); } catch { cfg = null; }
    if (cfg && cfg.enabled === false) return 0;
    const rules = opts.rules ?? rulesFromConfig(cfg);
    const gapMin = opts.gapMin ?? 0;

    if (!pushConfigured()) return 0;
    ensureVapid();

    // Throttle: check the last send for (user, notifKey)
    const { data: logs } = await admin
      .from("push_log")
      .select("user_id, last_sent_at")
      .eq("notif_key", opts.notifKey)
      .in("user_id", userIds);
    const lastSent = new Map((logs || []).map((r: any) => [r.user_id, r.last_sent_at]));

    const eligible = userIds.filter((uid) => !throttled(lastSent.get(uid), gapMin, nowMs));
    if (!eligible.length) return 0;

    // Fetch subscriptions for eligible users
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("user_id, endpoint, p256dh, auth")
      .in("user_id", eligible)
      .limit(MAX_SUBS_PER_SEND);
    if (!subs || !subs.length) return 0;

    const json = JSON.stringify(payload);
    let sent = 0;
    const dead: string[] = [];

    await mapLimit(subs as SubRow[], CONCURRENCY, async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          json,
          { TTL: 24 * 60 * 60 } // 24h — notifications survive short offline periods
        );
        sent++;
      } catch (err: any) {
        const status = err?.statusCode;
        if (status === 404 || status === 410) dead.push(s.endpoint); // unsubscribed/expired
        // 429 etc: ignore, next time
      }
    });

    // Clean up dead endpoints (one path at a time — REST multi-delete 400s)
    for (const endpoint of dead) {
      await admin.from("push_subscriptions").delete().eq("endpoint", endpoint);
    }

    // Update the throttle log once per user (even if some of their devices failed)
    const nowIso = new Date(nowMs).toISOString();
    const rows = Array.from(new Set((subs as SubRow[]).map((s) => s.user_id)))
      .map((uid) => ({ user_id: uid, notif_key: opts.notifKey, last_sent_at: nowIso }));
    if (rows.length) await admin.from("push_log").upsert(rows, { onConflict: "user_id,notif_key" });

    return sent;
  } catch {
    return 0; // never break the parent request
  }
}
