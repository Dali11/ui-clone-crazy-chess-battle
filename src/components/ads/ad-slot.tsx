"use client";

import { useEffect, useRef, useState } from "react";

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
  | "draughts_results";

interface PlacementConfig {
  enabled: boolean;
  script: string;
}

interface AdsConfig {
  enabled: boolean;
  placements: Partial<Record<AdPlacement, PlacementConfig>>;
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
        const pc = document.createElement("link");
        pc.rel = "preconnect";
        pc.href = origin;
        pc.crossOrigin = "anonymous";
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

export default function AdSlot({
  placement,
  className = "",
}: {
  placement: AdPlacement;
  className?: string;
}) {
  const [script, setScript] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const injected = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadAdsConfig().then((cfg) => {
      if (cancelled) return;
      const p = cfg?.placements?.[placement];
      setScript(cfg?.enabled && p?.enabled && p.script ? p.script : null);
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
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(
      `<!DOCTYPE html><html><head><meta name="color-scheme" content="dark">` +
      `<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style>` +
      `</head><body>${script}</body></html>`
    );
    doc.close();

    // Mobile scale-down: on small screens the banner is visually halved
    // (user request — less intrusive). This is a pure CSS transform on the
    // iframe: Adsterra still loads the creative at full size, so
    // impression counting and click tracking inside their nested iframe
    // are completely unaffected — only the rendered pixels shrink. The
    // wrapper height is collapsed to the scaled height so no blank space
    // is left under the ad.
    const MOBILE_MAX_W = 640;
    const MOBILE_SCALE = 0.5;
    let scaleListener: (() => void) | null = null;

    const applyScale = (h: number) => {
      if (scaleListener) window.removeEventListener("resize", scaleListener);
      const apply = () => {
        const m = window.innerWidth < MOBILE_MAX_W;
        const s = m ? MOBILE_SCALE : 1;
        iframe.style.transform = s === 1 ? "" : `scale(${s})`;
        iframe.style.transformOrigin = "top center";
        host.style.height = s === 1 ? "" : `${Math.round(h * s)}px`;
      };
      apply();
      scaleListener = apply;
      window.addEventListener("resize", apply);
    };

    const fitHeight = () => {
      try {
        const h = iframe.contentDocument?.body?.scrollHeight || 0;
        if (h > 0) {
          iframe.style.height = `${h}px`;
          applyScale(h);
        }
      } catch { /* cross-origin render — leave default */ }
    };
    iframe.addEventListener("load", fitHeight);
    // Ad networks render their banner in a nested iframe that can pop in
    // late — re-check the height a few times after load.
    const timers = [300, 800, 1600, 3000, 5000].map((ms) =>
      window.setTimeout(fitHeight, ms)
    );
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      if (scaleListener) window.removeEventListener("resize", scaleListener);
    };
  }, [script]);

  if (!script) return null;

  return (
    <div className={`w-full ${className}`} data-ad-placement={placement}>
      <p className="text-[10px] uppercase tracking-widest text-ccb-muted/60 mb-1 text-center">Sponsored</p>
      <div ref={containerRef} className="w-full overflow-hidden rounded-lg" />
    </div>
  );
}
