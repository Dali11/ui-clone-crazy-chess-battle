"use client";

// Small country flag rendered next to a player's avatar. Takes an ISO
// 3166-1 alpha-2 code ("MW", "ZA", ...) and uses flagcdn.com images.
// Renders nothing for missing/malformed codes or on load failure, so the
// player bar never shows a broken image.
export default function CountryFlag({ code, className }: { code?: string | null; className?: string }) {
  const clean = (code || "").trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(clean)) return null;
  return (
    <img
      src={`https://flagcdn.com/w40/${clean}.png`}
      srcSet={`https://flagcdn.com/w80/${clean}.png 2x`}
      alt={clean.toUpperCase()}
      title={clean.toUpperCase()}
      loading="lazy"
      className={`shrink-0 rounded-[2px] object-cover shadow-sm ring-1 ring-black/10 ${className ?? "w-5 h-[14px]"}`}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}
