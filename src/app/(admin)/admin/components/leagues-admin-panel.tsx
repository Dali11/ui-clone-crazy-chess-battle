"use client";

import { useCallback, useEffect, useState } from "react";
import { Crown, RefreshCw, Users, CalendarRange, Coins, TrendingUp, UserPlus } from "lucide-react";

/**
 * Leagues admin panel — manage the tiered monthly XP championship from
 * the admin menu (owner correction 2026-09-26: the five-tier ladder and
 * fair-share rebalance are maintained on the monthly cycle). Shows
 * live roster vs fair-share targets and the management toggles
 * (monthly payouts, promotion/relegation, registration). Players never
 * see this panel — the league UI always displays configured reward
 * amounts, so switching payouts off is invisible to players.
 */

type Status = {
  tiers: { tier: number; name: string; count: number; active: number; target: number }[];
  total: number;
  monthStart: string;
  monthEnd: string;
  seasonStart: string | null;
  flags: {
    monthlyPayouts: boolean;
    payoutsStart: string | null;
    rewardsEnabled: boolean;
    monthlyPayoutsEnabled: boolean;
    tierMoves: boolean;
    registrationOpen: boolean;
  };
};

type ToggleDef = {
  key: string;
  flag: "monthlyPayoutsEnabled" | "tierMoves" | "registrationOpen";
  icon: typeof Coins;
  title: string;
  help: string;
};

const TOGGLES: ToggleDef[] = [
  {
    key: "monthly_rewards_enabled",
    flag: "monthlyPayoutsEnabled",
    icon: Coins,
    title: "Monthly Cash Payouts",
    help: "Pays each tier's top monthly_top_count players of the month when the cycle closes on the 1st. OFF = the leagues, XP and leaderboards keep running and reward amounts stay displayed to players — only wallet credits stop. Use to skip a partial month.",
  },
  {
    key: "tier_moves_enabled",
    flag: "tierMoves",
    icon: TrendingUp,
    title: "Standard Promotion / Relegation",
    help: "Top N promote / bottom N demote at each monthly settle. OFF while building the player base — the fair-share rebalance is the only thing that moves players. Flip ON once Premier approaches the tier cap.",
  },
  {
    key: "registration_open",
    flag: "registrationOpen",
    icon: UserPlus,
    title: "Registration Open",
    help: "Whether players can join the leagues. OFF blocks new joins; existing players are unaffected.",
  },
];

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[m - 1]} ${y}`;
}

export default function LeaguesAdminPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [startDateInput, setStartDateInput] = useState("");
  const [startDateDirty, setStartDateDirty] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/leagues/status", { cache: "no-store" });
      if (res.ok) setStatus(await res.json());
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);
  useEffect(() => {
    if (status?.flags.payoutsStart) {
      setStartDateInput(status.flags.payoutsStart);
      setStartDateDirty(false);
    }
  }, [status?.flags.payoutsStart]);

  const saveConfigPatch = async (patch: Record<string, unknown>) => {
    const cfgRes = await fetch("/api/admin/platform-settings?section=leagues_xp", { cache: "no-store" });
    if (!cfgRes.ok) throw new Error("config fetch failed");
    const { config } = await cfgRes.json();
    const next = { ...config, ...patch };
    const res = await fetch("/api/admin/platform-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "leagues_xp", config: next }),
    });
    if (!res.ok) throw new Error("save failed");
    await fetchStatus();
  };

  const toggle = async (key: string, value: boolean) => {
    setBusyKey(key);
    // Optimistic flip
    if (status) {
      const flagKey = TOGGLES.find((t) => t.key === key)?.flag;
      if (flagKey) setStatus({ ...status, flags: { ...status.flags, [flagKey]: value } });
    }
    try {
      await saveConfigPatch({ [key]: value });
      setToast({ msg: value ? "Switched ON" : "Switched OFF", ok: true });
    } catch {
      setToast({ msg: "Failed to save", ok: false });
      await fetchStatus();
    } finally {
      setBusyKey(null);
      setTimeout(() => setToast(null), 2500);
    }
  };

  const saveStartDate = async (value: string | null) => {
    setBusyKey("payouts_start");
    try {
      await saveConfigPatch({ payouts_start: value });
      setToast({ msg: value ? "Payouts start date saved" : "Date gate removed — payouts follow the toggle", ok: true });
    } catch {
      setToast({ msg: "Failed to save date", ok: false });
      await fetchStatus();
    } finally {
      setBusyKey(null);
      setTimeout(() => setToast(null), 2500);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown className="w-5 h-5 text-ccb-primary" />
          <h2 className="text-lg font-semibold text-ccb-text">League Management</h2>
          {toast && (
            <span className={`text-xs font-medium ${toast.ok ? "text-ccb-success" : "text-red-400"}`}>{toast.msg}</span>
          )}
        </div>
        <button
          onClick={fetchStatus}
          className="flex items-center gap-1.5 text-xs font-medium text-ccb-muted hover:text-ccb-text transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-ccb-border bg-ccb-surface/40 p-3">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-ccb-muted flex items-center gap-1"><Users className="w-3 h-3" /> Players in leagues</p>
          <p className="text-xl font-bold text-ccb-text mt-1">{status?.total ?? "—"}</p>
        </div>
        <div className="rounded-xl border border-ccb-border bg-ccb-surface/40 p-3">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-ccb-muted flex items-center gap-1"><CalendarRange className="w-3 h-3" /> Current cycle</p>
          <p className="text-sm font-bold text-ccb-text mt-1.5">{status ? `${fmtDate(status.monthStart)} → ${fmtDate(status.monthEnd)}` : "—"}</p>
          <p className="text-[10px] text-ccb-muted mt-0.5">Settle + reset on the 1st</p>
        </div>
        <div className="rounded-xl border border-ccb-border bg-ccb-surface/40 p-3">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-ccb-muted">Season start</p>
          <p className="text-sm font-bold text-ccb-text mt-1.5">{fmtDate(status?.seasonStart ?? null)}</p>
        </div>
        <div className="rounded-xl border border-ccb-border bg-ccb-surface/40 p-3">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-ccb-muted">Monthly payouts</p>
          <p className={`text-sm font-bold mt-1.5 ${status?.flags.monthlyPayouts ? "text-ccb-success" : "text-amber-400"}`}>
            {status ? (status.flags.monthlyPayouts ? "PAYING" : "PAUSED (invisible to players)") : "—"}
          </p>
          {status?.flags.payoutsStart && (
            <p className="text-[10px] text-ccb-muted mt-0.5">Date gate {fmtDate(status.flags.payoutsStart)}</p>
          )}
        </div>
      </div>

      {/* Roster table */}
      <div className="rounded-xl border border-ccb-border bg-ccb-surface/40 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-ccb-border bg-ccb-surface/60 text-[11px] uppercase tracking-wide font-semibold text-ccb-muted">
          Rosters vs fair share
        </div>
        <div className="divide-y divide-ccb-border">
          {(status?.tiers ?? []).map((t) => {
            const drift = t.count - t.target;
            return (
              <div key={t.tier} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm font-medium text-ccb-text">Tier {t.tier} · {t.name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold tabular-nums text-ccb-text">{t.count}</span>
                  <span className="text-[10px] text-ccb-muted">/ {t.target}</span>
                  <span className={`text-[10px] font-medium ${Math.abs(drift) < 5 ? "text-ccb-success" : "text-amber-400"}`}>
                    {drift === 0 ? "even" : drift > 0 ? `+${drift} over` : `${drift} short`}
                  </span>
                  <span className="text-[10px] text-ccb-muted">{t.active} active this month</span>
                </div>
              </div>
            );
          })}
          {status && (
            <div className="px-4 py-2 text-[10px] text-ccb-muted">
              Rebalance fires at the monthly settle when any league drifts 5+ from its fair share (total ÷ 5).
            </div>
          )}
        </div>
      </div>

      {/* Toggles */}
      <div className="rounded-xl border border-ccb-border bg-ccb-surface/40 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-ccb-border bg-ccb-surface/60 text-[11px] uppercase tracking-wide font-semibold text-ccb-muted">
          Management switches
        </div>
        <div className="divide-y divide-ccb-border">
          {TOGGLES.map((t) => {
            const value = status ? status.flags[t.flag] : false;
            const Icon = t.icon;
            return (
              <div key={t.key} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ccb-text flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 text-ccb-primary" /> {t.title}
                  </p>
                  <p className="text-[10px] text-ccb-muted mt-0.5">{t.help}</p>
                </div>
                <button
                  onClick={() => toggle(t.key, !value)}
                  disabled={busyKey === t.key || !status}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                    value ? "bg-ccb-primary" : "bg-ccb-border"
                  }`}
                >
                  <span
                    className="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform"
                    style={{ transform: value ? "translateX(20px)" : "translateX(4px)" }}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payouts start gate — EDITABLE (owner request: the date must be
          manageable from this panel, not hardcoded). Month-granular now:
          payouts begin with the first cycle STARTING on/after this date. */}
      <div className="rounded-xl border border-ccb-border bg-ccb-surface/40 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-ccb-border bg-ccb-surface/60 text-[11px] uppercase tracking-wide font-semibold text-ccb-muted">
          Payouts start gate
        </div>
        <div className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ccb-text">First month that pays out</p>
            <p className="text-[10px] text-ccb-muted mt-0.5 leading-relaxed">
              Payouts begin with the first cycle <b>starting</b> on or after this date — earlier months settle
              invisibly (leagues, XP and leaderboards keep running; players keep seeing reward amounts, nothing is paid).
              Clear it and every closed month pays, as long as the Monthly Cash Payouts switch above is ON.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="date"
              value={startDateInput}
              onChange={(e) => { setStartDateInput(e.target.value); setStartDateDirty(true); }}
              className="rounded-lg border border-ccb-border bg-ccb-surface px-2.5 py-1.5 text-sm text-ccb-text"
            />
            <button
              onClick={() => saveStartDate(startDateInput || null)}
              disabled={!startDateDirty || busyKey === "payouts_start" || !status}
              className="rounded-lg bg-ccb-primary px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
            >
              Save
            </button>
            <button
              onClick={() => { setStartDateInput(""); setStartDateDirty(true); saveStartDate(null); }}
              disabled={busyKey === "payouts_start" || !status?.flags.payoutsStart}
              className="rounded-lg border border-ccb-border px-3 py-1.5 text-xs font-medium text-ccb-muted hover:text-ccb-text disabled:opacity-40"
            >
              Clear
            </button>
          </div>
        </div>
        {status?.flags.payoutsStart && (
          <div className="px-4 pb-3 text-[10px] text-ccb-muted">
            Current gate: cycles starting on or after <b>{fmtDate(status.flags.payoutsStart)}</b> pay out.
          </div>
        )}
      </div>
    </div>
  );
}
