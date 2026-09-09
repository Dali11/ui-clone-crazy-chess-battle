"use client";

import { useEffect, useRef, useState } from "react";

// Country name from the ISO alpha-2 code using the browser's built-in
// region display names — no lookup table to maintain.
function regionName(code: string): string {
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    return dn.of(code.toUpperCase()) || code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

// Small country flag rendered next to a player's avatar. Takes an ISO
// 3166-1 alpha-2 code ("MW", "ZA", ...) and uses flagcdn.com images.
// Renders nothing for missing/malformed codes or on load failure, so the
// player bar never shows a broken image. Click (or hover on desktop)
// reveals the full country name, chess.com-style; the flag carries a
// light ring so its edge stays readable on the dark game surface.
export default function CountryFlag({ code, className }: { code?: string | null; className?: string }) {
  const [showName, setShowName] = useState(false);
  const wrapRef = useRef<HTMLButtonElement>(null);

  // Close on any click/tap outside the flag
  useEffect(() => {
    if (!showName) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setShowName(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("touchstart", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("touchstart", onDoc);
    };
  }, [showName]);

  // Close on Escape
  useEffect(() => {
    if (!showName) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowName(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showName]);

  const clean = (code || "").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(clean)) return null;

  const name = regionName(clean);

  return (
    <button
      type="button"
      ref={wrapRef}
      aria-label={name}
      title={name}
      onClick={(e) => {
        e.stopPropagation();
        setShowName((v) => !v);
      }}
      onMouseEnter={() => setShowName(true)}
      onMouseLeave={() => setShowName(false)}
      onBlur={() => setShowName(false)}
      className="relative shrink-0 cursor-pointer bg-transparent border-0 p-0 m-0 leading-none"
    >
      <img
        src={`https://flagcdn.com/w40/${clean}.png`}
        srcSet={`https://flagcdn.com/w80/${clean}.png 2x`}
        alt={name}
        loading="lazy"
        className={`rounded-[2px] object-cover ring-1 ring-white/60 ${className ?? "w-4 h-[11px]"}`}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = "none";
        }}
      />
      {showName && (
        <span
          role="tooltip"
          className="absolute left-0 top-[calc(100%+4px)] z-50 whitespace-nowrap px-2 py-1 rounded-md text-[11px] font-medium bg-ccb-card text-ccb-text border border-ccb-border shadow-lg pointer-events-none"
        >
          {name}
        </span>
      )}
    </button>
  );
}
