"use client";

import { useEffect, useRef, useState } from "react";
import { decideAd, loadState, saveState, type AdFrequencyCaps } from "@/lib/ads/frequency";

/**
 * AdSlot — renders an ad network snippet (Adsterra) for a given placement,
 * driven entirely by the admin Ads section (platform_settings.ads).
 *
 * Design constraints:
 *  - Renders NOTHING unless the admin enabled the global switch AND this
 *    placement AND pasted a script for it — zero-cost when off.
 *  - The snippet is injected inside an isolated <iframe> (about:blank,
 *    same-origin) because ad-network invoke scripts use document.write(),
 *    which would otherwise wipe the host page when executed after load.
 *    Iframe isolation also prevents atOptions collisions when two
 *    different ad units render on the same page.
 *  - Lazy by construction: mounting an AdSlot (e.g. on the results screen)
 *    is what renders the ad — ads never display during gameplay.
 *  - FREQUENCY ROUTED: every mount passes the ad-frequency policy
 *    (src/lib/ads/frequency.ts — nth-game gate, daily/hourly caps, min
 *    gap between ads) before rendering. Impressions are counted per
 *    player in localStorage; the policy is admin-configurable in
 *    Platform Settings → Ads.
 *
 * Speed (the ad chain is 3 serial round-trips: config → invoke.js → banner):
 *  - The config fetch and a preload of each snippet's invoke.js are kicked
 *    off at module-eval time, i.e. when the host page (game page, lobby,
 *    live) first loads — long before a result screen appears. Warming the
 *    script file (DNS+TLS+HTTP cache) does NOT render an ad and does not
 *    count an impression; only the actual slot render does.
 */

export type AdPlacement =
  | "lobby"
  | "spectate"
  | "game_results"
  | "battle_settlement"
  | "draughts_results"
  | "challenge_finished"
  | "leagues"
  | "leagues_inline";

export interface DirectCreative {
  id: string;
  headline: string;
  body: string | null;
  image_url: string | null;
  target_url: string;
  business_name: string;
}

interface PlacementConfig {
  enabled: boolean;
  script: string;
}

interface AdsConfig {
  enabled: boolean;
  directAds?: { enabled: boolean; pricePerWeekMwk: number };
  placements: Partial<Record<AdPlacement, PlacementConfig>>;
  frequency: AdFrequencyCaps;
}

let configPromise: Promise<AdsConfig | null> | null = null;

function loadAdsConfig(): Promise<AdsConfig | null> {
  if (!configPromise) {
    configPromise = fetch("/api/ads/config")
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    // Allow a re-fetch on the next page load (SPA navigations keep state).
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => { configPromise = null; });
    }
  }
  return configPromise;
}

/* ---------- Early warm-up: config + invoke.js preload ---------- */

function extractScriptUrls(html: string): string[] {
  const urls: string[] = [];
  const re = /src\s*=\s*["\']([^"\']+)["\']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const u = m[1];
    if (u.startsWith("http")) urls.push(u);
  }
  return urls;
}

function warmUpAdNetworks(cfg: AdsConfig | null) {
  if (!cfg?.enabled) return;
  const seenOrigins = new Set<string>();
  const head = document.head;
  const id = "ccb-ad-warmup";
  // Replace any previous warmup links (config may have changed).
  head.querySelectorAll(`link[data-ccb-ad-warmup]`).forEach((l) => l.remove());

  for (const p of Object.values(cfg.placements ?? {})) {
    if (!p?.enabled || !p.script) continue;
    for (const url of extractScriptUrls(p.script)) {
      let origin: string;
      try { origin = new URL(url).origin; } catch { continue; }
      if (!seenOrigins.has(origin)) {
        seenOrigins.add(origin);
        // Plain preconnect (no crossorigin attr): classic ad scripts are
        // fetched no-cors, so a crossorigin="anonymous" preconnect would
        // open a *separate* connection and never be reused.
        const pc = document.createElement("link");
        pc.rel = "preconnect";
        pc.href = origin;
        pc.dataset.ccbAdWarmup = "1";
        head.appendChild(pc);
      }
      const pl = document.createElement("link");
      pl.rel = "preload";
      pl.as = "script";
      pl.href = url;
      pl.dataset.ccbAdWarmup = "1";
      head.appendChild(pl);
    }
  }
}

if (typeof window !== "undefined") {
  // Module-eval prefetch: this module is imported by the game/lobby/live
  // pages, so the tiny config JSON + the ad invoke script (file only,
  // never executed here) are fetched as soon as the page loads.
  loadAdsConfig().then(warmUpAdNetworks).catch(() => {});
}

/* ---------- Component ---------- */

// Membership cache (module scope, shared by every AdSlot instance):
// members never see ads. Short TTL so a fresh purchase takes effect
// on the next page without per-mount requests.
let memberCache: { value: boolean; at: number } | null = null;
async function isMemberSuppressed(): Promise<boolean> {
  if (memberCache && Date.now() - memberCache.at < 30_000) return memberCache.value;
  try {
    const r = await fetch("/api/membership/status");
    if (!r.ok) return false;
    const d = await r.json();
    memberCache = { value: !!d.member, at: Date.now() };
    return memberCache.value;
  } catch {
    return false; // fail open: show ads rather than lose revenue on a blip
  }
}

export default function AdSlot({
  placement,
  className = "",
}: {
  placement: AdPlacement;
  className?: string;
}) {
  const [script, setScript] = useState<string | null>(null);
  const [direct, setDirect] = useState<DirectCreative | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const injected = useRef(false);

  const routed = useRef(false); // one router decision per mount (StrictMode-safe)

  useEffect(() => {
    let cancelled = false;
    loadAdsConfig().then(async (cfg) => {
      if (cancelled) return;
      // Members are ad-free for BOTH direct ads and the network.
      if (await isMemberSuppressed()) {
        setScript(null);
        setDirect(null);
        return;
      }
      // Frequency router FIRST — direct ads obey the same caps; a mount
      // is the impression opportunity either way.
      if (routed.current) { setScript(null); setDirect(null); return; }
      routed.current = true;
      const decision = decideAd({
        placement,
        caps: cfg?.frequency || { minGapSec: 90, hourlyCap: 4, dailyCap: 12, resultsEveryN: 3 },
        state: loadState(),
        now: Date.now(),
      });
      saveState(decision.state);
      if (!decision.show) { setScript(null); setDirect(null); return; }

      // Direct campaigns take priority over the ad network (they're the
      // paid inventory). One rotation fetch per mount, cached briefly.
      if (cfg?.directAds?.enabled) {
        try {
          const r = await fetch("/api/ads/active", { cache: "no-store" });
          if (r.ok) {
            const d = await r.json();
            if (!cancelled && d.campaign) {
              setDirect(d.campaign);
              fetch("/api/ads/track", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ campaignId: d.campaign.id, kind: "impression" }),
              }).catch(() => {});
              return;
            }
          }
        } catch { /* fall through to network */ }
      }
      if (cancelled) return;
      setDirect(null);

      const p = cfg?.placements?.[placement];
      if (!cfg?.enabled || !p?.enabled || !p.script) {
        setScript(null);
        return;
      }
      setScript(p.script);
    });
    return () => { cancelled = true; };
  }, [placement]);

  useEffect(() => {
    if (!script || injected.current || !containerRef.current) return;
    injected.current = true;

    const host = containerRef.current;
    host.innerHTML = "";

    const iframe = document.createElement("iframe");
    iframe.setAttribute("title", "advertisement");
    iframe.setAttribute("scrolling", "no");
    iframe.style.cssText = "width:100%;border:0;display:block;overflow:hidden";
    host.appendChild(iframe);

    // Same-origin about:blank iframe: document.write stays contained and
    // we can read the rendered height after load for seamless sizing.
    // The head pre-warms the ad domains so the iframe does not pay a
    // DNS+TLS cold start before fetching invoke.js (cache/connections are
    // partitioned per frame — the host page's preconnects don't cover it).
    const origins = [...new Set(
      extractScriptUrls(script)
        .map((u) => { try { return new URL(u).origin; } catch { return null; } })
        .filter(Boolean)
    )];
    const warmLinks = origins
      .map((o) => `<link rel="preconnect" href="${o}"><link rel="dns-prefetch" href="${o}">`)
      .join("");
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(
      `<!DOCTYPE html><html><head><meta name="color-scheme" content="dark">` +
      warmLinks +
      `<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style>` +
      `</head><body>${script}</body></html>`
    );
    doc.close();

    // Ad sizing is admin-driven: the admin panel stores whichever ad-unit
    // snippet Adsterra generated (e.g. a 320x50 for mobile-sized screens),
    // and we render it at its declared size — no CSS scaling here. The
    // earlier scale-to-half transform was removed once a properly-sized
    // 320x50 unit was configured; render the unit as-is.
    const fitHeight = () => {
      try {
        const h = iframe.contentDocument?.body?.scrollHeight || 0;
        if (h > 0) iframe.style.height = `${h}px`;
      } catch { /* cross-origin render — leave default */ }
    };
    iframe.addEventListener("load", fitHeight);
    // Ad networks render their banner in a nested iframe that can pop in
    // late — re-check the height a few times after load.
    const timers = [300, 800, 1600, 3000, 5000].map((ms) =>
      window.setTimeout(fitHeight, ms)
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [script]);

  if (direct) {
    const trackClick = () => {
      fetch("/api/ads/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: direct.id, kind: "click" }),
      }).catch(() => {});
    };
    return (
      <div className={`w-full ${className}`} data-ad-placement={placement}>
        <p className="text-[10px] uppercase tracking-widest text-ccb-muted/60 mb-0.5 text-center">Sponsored</p>
        <a
          href={direct.target_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={trackClick}
          className="block w-full overflow-hidden rounded-lg border border-ccb-border bg-ccb-surface hover:border-ccb-primary/40 transition-colors"
        >
          {direct.image_url ? (
            <div className="w-full flex justify-center bg-ccb-bg/60">
              {/* Ratio-aware: contain (never crop) so square, 1.91:1, 16:9
                  and wide banners all render intact instead of being
                  sliced by a fixed-height crop. */}
              <img src={direct.image_url} alt={direct.business_name} className="w-full max-h-28 object-contain" />
            </div>
          ) : null}
          <div className="px-3 py-2 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ccb-text truncate">{direct.headline}</p>
              {direct.body ? <p className="text-[11px] text-ccb-muted truncate">{direct.body}</p> : null}
            </div>
            <span className="shrink-0 text-[11px] font-bold text-ccb-primary">Visit →</span>
          </div>
        </a>
      </div>
    );
  }

  if (!script) return null;

  return (
    <div className={`w-full ${className}`} data-ad-placement={placement}>
      <p className="text-[10px] uppercase tracking-widest text-ccb-muted/60 mb-0.5 text-center">Sponsored</p>
      <div ref={containerRef} className="w-full overflow-hidden rounded-lg" />
    </div>
  );
}
