"use client";

/**
 * Lightweight stacked-bar revenue chart — pure SVG, zero chart deps.
 * Each bar is one day/month bucket; segments are the revenue streams
 * currently enabled via the filter chips. Hover shows a breakdown.
 */

import { useMemo, useState } from "react";
import type { SeriesPoint } from "./types";

export const STREAM_COLORS: Record<string, string> = {
  battles: "#7c3aed",        // brand purple
  tournaments: "#a78bfa",    // light violet
  memberships: "#fbbf24",   // gold
  ads: "#34d399",            // emerald
  withdrawal_fees: "#38bdf8", // sky
};

const STREAM_LABELS: Record<string, string> = {
  battles: "Battles",
  tournaments: "Tournaments",
  memberships: "Memberships",
  ads: "Ads",
  withdrawal_fees: "Withdrawal Fees",
};

function fmtUsd(v: number): string {
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}

export default function RevenueChart({
  series,
  streams,
  granularity,
}: {
  series: SeriesPoint[];
  streams: string[];
  granularity: "day" | "month";
}) {
  const [hover, setHover] = useState<number | null>(null);

  const data = useMemo(() => {
    const active = streams.length > 0 ? streams : Object.keys(STREAM_COLORS);
    const rows = series.map((p) => ({
      bucket: p.bucket,
      total: active.reduce((s, k) => s + (Number((p as any)[k]) || 0), 0),
      parts: active.map((k) => ({ key: k, value: Number((p as any)[k]) || 0 })),
    }));
    const max = Math.max(1, ...rows.map((r) => r.total));
    return { rows, max, active };
  }, [series, streams]);

  const W = 900;
  const H = 240;
  const PAD = { l: 52, r: 12, t: 16, b: 30 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const n = Math.max(1, data.rows.length);
  const barW = Math.max(2, (innerW / n) * 0.65);
  const step = innerW / n;

  const labelEvery = Math.ceil(n / 12);
  const hovered = hover != null ? data.rows[hover] : null;

  if (series.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-ccb-muted">
        No revenue recorded in this period.
      </div>
    );
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Revenue by stream">
        {/* gridlines + Y labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = PAD.t + innerH * (1 - f);
          return (
            <g key={f}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y} y2={y} stroke="#2a2a3a" strokeWidth={1} />
              <text x={PAD.l - 8} y={y + 4} textAnchor="end" fontSize={11} fill="#9ca3af">
                {f === 0 ? "$0" : fmtUsd(data.max * f)}
              </text>
            </g>
          );
        })}

        {/* bars */}
        {data.rows.map((row, i) => {
          const x = PAD.l + step * i + (step - barW) / 2;
          let yCursor = PAD.t + innerH;
          return (
            <g
              key={row.bucket}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {/* invisible hit area */}
              <rect x={PAD.l + step * i} y={PAD.t} width={step} height={innerH} fill="transparent" />
              {row.parts.map((part) => {
                if (part.value <= 0) return null;
                const h = (part.value / data.max) * innerH;
                yCursor -= h;
                const dim = hover != null && hover !== i;
                return (
                  <rect
                    key={part.key}
                    x={x}
                    y={yCursor}
                    width={barW}
                    height={Math.max(h, 1)}
                    fill={STREAM_COLORS[part.key]}
                    opacity={dim ? 0.25 : 1}
                    rx={1}
                  />
                );
              })}
            </g>
          );
        })}

        {/* X labels (sparse) */}
        {data.rows.map((row, i) => {
          if (i % labelEvery !== 0 && i !== n - 1) return null;
          const label =
            granularity === "month"
              ? new Date(`${row.bucket}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit" })
              : new Date(`${row.bucket}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "short" });
          return (
            <text
              key={row.bucket}
              x={PAD.l + step * i + step / 2}
              y={H - 8}
              textAnchor="middle"
              fontSize={10}
              fill="#9ca3af"
            >
              {label}
            </text>
          );
        })}
      </svg>

      {/* legend */}
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {data.active.map((k) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-xs text-ccb-muted">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: STREAM_COLORS[k] }} />
            {STREAM_LABELS[k]}
          </span>
        ))}
      </div>

      {/* hover breakdown */}
      {hovered && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg border border-ccb-border bg-ccb-card/95 px-3 py-2 shadow-xl backdrop-blur">
          <p className="mb-1 text-xs font-medium text-white">
            {granularity === "month"
              ? new Date(`${hovered.bucket}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric" })
              : new Date(`${hovered.bucket}T00:00:00Z`).toLocaleDateString("en-US", { day: "numeric", month: "long" })}
            {" · "}
            <span className="font-semibold">{fmtUsd(hovered.total)}</span>
          </p>
          {hovered.parts
            .filter((p) => p.value > 0)
            .map((p) => (
              <p key={p.key} className="flex items-center gap-1.5 text-[11px] text-ccb-muted">
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: STREAM_COLORS[p.key] }} />
                {STREAM_LABELS[p.key]} · {fmtUsd(p.value)}
              </p>
            ))}
        </div>
      )}
    </div>
  );
}
