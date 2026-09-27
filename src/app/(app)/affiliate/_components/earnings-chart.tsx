interface EarningsChartProps {
  /** Earnings per month, oldest → newest (UTC). */
  perMonth: number[];
  /** Month labels matching perMonth. */
  labels: string[];
  /** Formats a wallet amount in the viewer's display currency. */
  format: (n: number) => string;
}

/**
 * 6-month commission bar chart — pure CSS, no chart library. Bars scale to
 * the window's max; a zero-earnings window shows an empty-state note.
 */
export default function EarningsChart({ perMonth, labels, format }: EarningsChartProps) {
  const max = Math.max(...perMonth, 1);
  const hasAny = perMonth.some((n) => n > 0);

  return (
    <div className="bg-ccb-card border border-ccb-border rounded-2xl p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <label className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted">
          Commission — last 6 months
        </label>
        <span className="text-[10px] text-ccb-muted">paid to wallet</span>
      </div>

      <div className="flex items-end gap-2 sm:gap-3 h-32 sm:h-40">
        {perMonth.map((amount, i) => {
          const pct = hasAny ? Math.max((amount / max) * 100, amount > 0 ? 6 : 0) : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1.5">
              {amount > 0 && (
                <span
                  className="text-[9px] sm:text-[10px] font-bold text-ccb-primary truncate max-w-full"
                  title={format(amount)}
                >
                  {format(amount)}
                </span>
              )}
              <div
                className={
                  "w-full max-w-[44px] rounded-t-md transition-all " +
                  (amount > 0 ? "bg-ccb-primary" : "bg-ccb-surface border border-ccb-border/60")
                }
                style={{ height: hasAny ? `${Math.max(pct, amount > 0 ? 6 : 3)}%` : "3%" }}
                title={amount > 0 ? `${labels[i]}: ${format(amount)}` : `${labels[i]}: no commissions yet`}
              />
              <span className="text-[9px] sm:text-[10px] text-ccb-muted">{labels[i]}</span>
            </div>
          );
        })}
      </div>

      {!hasAny && (
        <p className="text-[11px] text-ccb-muted mt-3 text-center">
          No commissions yet — share your link, and your first activated friend starts this chart.
        </p>
      )}
    </div>
  );
}
