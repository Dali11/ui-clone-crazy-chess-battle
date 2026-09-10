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
 *  - The config is fetched once per page load and shared by every slot.
 *  - Lazy by construction: mounting an AdSlot (e.g. on the results screen)
 *    is what triggers the fetch/render — ads never load during gameplay.
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

    const fitHeight = () => {
      try {
        const h = iframe.contentDocument?.body?.scrollHeight || 0;
        if (h > 0) iframe.style.height = `${h}px`;
      } catch { /* cross-origin render — leave default */ }
    };
    iframe.addEventListener("load", fitHeight);
    const t = window.setTimeout(fitHeight, 1200); // late banners
    return () => window.clearTimeout(t);
  }, [script]);

  if (!script) return null;

  return (
    <div className={`w-full ${className}`} data-ad-placement={placement}>
      <p className="text-[10px] uppercase tracking-widest text-ccb-muted/60 mb-1 text-center">Sponsored</p>
      <div ref={containerRef} className="w-full overflow-hidden rounded-lg" />
    </div>
  );
}
