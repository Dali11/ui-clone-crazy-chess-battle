"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, RefreshCw } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 · Financial Controls
// Single control surface for the platform's money levers: battle rake and
// stakes, deposit/withdrawal limits and fees, membership and ad pricing,
// affiliate share, Zambia payments, and the revenue sweep.
//
// Sources of truth:
//   - platform_settings (section + jsonb) via /api/admin/platform-settings
//     (PATCH merges, syncs legacy tables, and audit-logs every change)
//   - battle_config via /api/admin/battle-config (whitelisted fields)
// ─────────────────────────────────────────────────────────────────────────────

type FieldType = "number" | "pct" | "money" | "toggle" | "list" | "text" | "phone";

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  hint?: string;
  /** for list fields: how to parse/serialize items */
  listType?: "number" | "string";
}

interface SectionDef {
  /** platform_settings section id, or "battle" for battle_config */
  id: string;
  source: "settings" | "battle";
  title: string;
  desc: string;
  fields: FieldDef[];
  /** show a caution banner on the card */
  warning?: string;
}

const SECTIONS: SectionDef[] = [
  {
    id: "battle",
    source: "battle",
    title: "Battle Economics",
    desc: "Rake and gameplay economics for money battles. Fee applies to every battle stake.",
    fields: [
      { key: "platform_fee_pct", label: "Platform fee", type: "pct", hint: "% of stake taken as rake" },
      { key: "min_games_for_battles", label: "Min games to unlock", type: "number", hint: "games before money battles unlock" },
      { key: "armageddon_pct", label: "Armageddon share", type: "pct", hint: "% of pool for armageddon rounds" },
      { key: "initial_minutes", label: "Base time", type: "number", hint: "minutes per game" },
      { key: "increment_seconds", label: "Increment", type: "number", hint: "seconds per move" },
      { key: "queue_timeout_s", label: "Queue timeout", type: "number", hint: "seconds before unmatched entry expires" },
      { key: "enabled", label: "Money battles enabled", type: "toggle" },
    ],
  },
  {
    id: "battles",
    source: "settings",
    title: "Battle Stakes",
    desc: "Stake range and preset levels offered in the battle lobby (MWK).",
    fields: [
      { key: "min_stake", label: "Minimum stake", type: "money" },
      { key: "max_stake", label: "Maximum stake", type: "money" },
      { key: "stake_levels", label: "Preset stake levels", type: "list", listType: "number", hint: "comma-separated MWK amounts" },
      { key: "enabled", label: "Stakes enabled", type: "toggle" },
    ],
  },
  {
    id: "deposits",
    source: "settings",
    title: "Deposits",
    desc: "Deposit window and crediting behaviour (MWK).",
    fields: [
      { key: "enabled", label: "Deposits enabled", type: "toggle" },
      { key: "min_amount", label: "Minimum deposit", type: "money" },
      { key: "max_amount", label: "Maximum deposit", type: "money" },
      { key: "auto_credit", label: "Auto-credit on payment", type: "toggle" },
      { key: "allowed_methods", label: "Allowed methods", type: "list", listType: "string", hint: "comma-separated, e.g. mpesa, airtel_money" },
    ],
  },
  {
    id: "withdrawals",
    source: "settings",
    title: "Withdrawals",
    desc: "Withdrawal window, daily caps and processing fee (MWK).",
    fields: [
      { key: "enabled", label: "Withdrawals enabled", type: "toggle" },
      { key: "min_amount", label: "Minimum withdrawal", type: "money" },
      { key: "max_amount", label: "Maximum withdrawal", type: "money" },
      { key: "daily_limit", label: "Daily limit per player", type: "money" },
      { key: "processing_fee_pct", label: "Processing fee", type: "pct", hint: "% deducted from withdrawal amount" },
      { key: "auto_approve", label: "Auto-approve requests", type: "toggle" },
    ],
  },
  {
    id: "membership",
    source: "settings",
    title: "Membership Pricing",
    desc: "Premium membership price points.",
    fields: [
      { key: "enabled", label: "Membership enabled", type: "toggle" },
      { key: "price_mwk", label: "Monthly price", type: "money" },
      { key: "yearly_price", label: "Yearly price", type: "money" },
      { key: "period_days", label: "Period", type: "number", hint: "days per monthly cycle" },
    ],
  },
  {
    id: "direct_ads",
    source: "settings",
    title: "Ad Campaign Pricing",
    desc: "Self-serve lobby ad pricing.",
    fields: [
      { key: "enabled", label: "Self-serve ads enabled", type: "toggle" },
      { key: "price_per_week_mwk", label: "Price per week", type: "money" },
    ],
  },
  {
    id: "affiliate",
    source: "settings",
    title: "Affiliate Program",
    desc: "Referrer bounty on referred-player fees and ad spend.",
    fields: [
      { key: "enabled", label: "Program enabled", type: "toggle" },
      { key: "fee_share_enabled", label: "Fee share enabled", type: "toggle" },
      { key: "fee_share_pct", label: "Fee share", type: "pct", hint: "% of platform fees paid to referrer" },
      { key: "ad_commission_enabled", label: "Ad commission enabled", type: "toggle" },
      { key: "ad_first_pct", label: "Ad share — first purchase", type: "pct" },
      { key: "ad_repeat_pct", label: "Ad share — repeat purchases", type: "pct" },
    ],
  },
  {
    id: "payments_zm",
    source: "settings",
    title: "Zambia Payments",
    desc: "Zambian deposit channel (ZMW).",
    fields: [
      { key: "enabled", label: "Zambia deposits enabled", type: "toggle" },
      { key: "min_deposit_zmw", label: "Minimum deposit", type: "number", hint: "ZMW" },
    ],
  },
  {
    id: "revenue_sweep",
    source: "settings",
    title: "Revenue Sweep",
    desc: "Automatic payout of accumulated revenue to the owner wallet.",
    warning:
      "These settings control live automatic payouts of platform revenue. Double-check before saving.",
    fields: [
      { key: "enabled", label: "Sweep enabled", type: "toggle" },
      { key: "auto_payout", label: "Auto payout", type: "toggle" },
      { key: "min_mwk", label: "Payout threshold", type: "money", hint: "sweep only fires above this balance" },
      { key: "dest_phone", label: "Destination phone", type: "phone" },
      { key: "dest_operator", label: "Destination operator", type: "text" },
    ],
  },
];

// ── helpers ─────────────────────────────────────────────────────────────────

function toInputValue(v: unknown, f: FieldDef): string | boolean {
  if (f.type === "toggle") return !!v;
  if (f.type === "list") return Array.isArray(v) ? v.join(", ") : "";
  if (v === null || v === undefined) return "";
  return String(v);
}

function fromInputValue(raw: string | boolean, f: FieldDef): unknown {
  if (f.type === "toggle") return !!raw;
  if (f.type === "list") {
    const items = String(raw)
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (f.listType === "number") return items.map((s) => Number(s)).filter((n) => !isNaN(n));
    return items;
  }
  if (f.type === "text" || f.type === "phone") return String(raw).trim();
  const n = Number(raw);
  return isNaN(n) ? 0 : n;
}

function validateField(f: FieldDef, val: unknown): string | null {
  if (f.type === "pct") {
    const n = Number(val);
    if (isNaN(n) || n < 0 || n > 100) return `${f.label} must be between 0 and 100`;
  }
  if (f.type === "number" || f.type === "money") {
    const n = Number(val);
    if (isNaN(n) || n < 0) return `${f.label} must be zero or more`;
  }
  if ((f.type === "text" || f.type === "phone") && !String(val).trim()) {
    return `${f.label} is required`;
  }
  return null;
}

// ── card ────────────────────────────────────────────────────────────────────

function ControlCard({
  def,
  values,
  dirty,
  saving,
  message,
  onChange,
  onSave,
}: {
  def: SectionDef;
  values: Record<string, unknown>;
  dirty: boolean;
  saving: boolean;
  message: { ok: boolean; text: string } | null;
  onChange: (key: string, val: string | boolean) => void;
  onSave: () => void;
}) {
  return (
    <section className="rounded-xl border border-ccb-border bg-ccb-card">
      <div className="border-b border-ccb-border px-4 py-3">
        <h3 className="text-sm font-semibold text-white">{def.title}</h3>
        <p className="mt-0.5 text-[11px] text-ccb-muted">{def.desc}</p>
      </div>

      {def.warning && (
        <div className="flex items-center gap-1.5 border-b border-amber-400/30 bg-amber-400/10 px-4 py-2 text-[11px] text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          {def.warning}
        </div>
      )}

      <div className="grid gap-3 px-4 py-4 sm:grid-cols-2 xl:grid-cols-3">
        {def.fields.map((f) => {
          const val = values[f.key];
          if (f.type === "toggle") {
            return (
              <label
                key={f.key}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  checked={!!val}
                  onChange={(e) => onChange(f.key, e.target.checked)}
                  disabled={saving}
                  className="h-4 w-4 shrink-0 accent-violet-600"
                />
                <span className="text-xs font-medium text-white">{f.label}</span>
              </label>
            );
          }
          return (
            <div key={f.key} className="space-y-1">
              <label className="block text-[11px] font-semibold text-white">
                {f.label}
                {f.type === "pct" ? " (%)" : f.type === "money" ? " (MWK)" : ""}
              </label>
              <input
                type={f.type === "number" || f.type === "money" || f.type === "pct" ? "number" : "text"}
                step={f.type === "pct" ? "0.1" : "any"}
                value={String(val ?? "")}
                onChange={(e) => onChange(f.key, e.target.value)}
                disabled={saving}
                className="w-full rounded-md border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-white placeholder:text-ccb-muted focus:border-violet-500 focus:outline-none disabled:opacity-50"
              />
              {f.hint && <p className="text-[10px] leading-snug text-ccb-muted">{f.hint}</p>}
            </div>
          );
        })}
      </div>

      {message && (
        <div
          className={`flex items-center gap-1.5 border-t px-4 py-2 text-[11px] ${
            message.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {message.ok ? <Check className="h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
          {message.text}
        </div>
      )}

      <div className="flex items-center justify-end border-t border-ccb-border px-4 py-2.5">
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || saving}
          className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
        </button>
      </div>
    </section>
  );
}

// ── main view ───────────────────────────────────────────────────────────────

export function ControlsView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, { ok: boolean; text: string }>>({});
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>({});
  const [baseline, setBaseline] = useState<Record<string, Record<string, unknown>>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, battleRes] = await Promise.all([
        fetch("/api/admin/platform-settings", { cache: "no-store" }),
        fetch("/api/admin/battle-config", { cache: "no-store" }),
      ]);
      if (!settingsRes.ok || !battleRes.ok) throw new Error("Failed to load platform settings");
      const settings = await settingsRes.json();
      const battle = await battleRes.json();

      const bySection: Record<string, Record<string, unknown>> = {};
      const base: Record<string, Record<string, unknown>> = {};

      for (const def of SECTIONS) {
        const src =
          def.source === "battle"
            ? (battle ?? {})
            : Array.isArray(settings)
              ? (settings.find((r: any) => r.section === def.id)?.config ?? {})
              : {};
        const fields: Record<string, unknown> = {};
        for (const f of def.fields) {
          fields[f.key] = toInputValue(src[f.key], f);
        }
        bySection[def.id] = fields;
        base[def.id] = { ...fields };
      }
      setValues(bySection);
      setBaseline(base);
    } catch (e: any) {
      setError(e.message || "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isDirty = (def: SectionDef) =>
    def.fields.some((f) => JSON.stringify(values[def.id]?.[f.key]) !== JSON.stringify(baseline[def.id]?.[f.key]));

  const handleChange = (def: SectionDef, key: string, raw: string | boolean) => {
    setValues((prev) => ({
      ...prev,
      [def.id]: { ...prev[def.id], [key]: raw },
    }));
  };

  const saveSection = async (def: SectionDef) => {
    // Validate changed fields client-side first
    const changed: Record<string, unknown> = {};
    for (const f of def.fields) {
      const cur = values[def.id]?.[f.key];
      if (JSON.stringify(cur) === JSON.stringify(baseline[def.id]?.[f.key])) continue;
      const parsed = fromInputValue(cur as string | boolean, f);
      const err = validateField(f, parsed);
      if (err) {
        setMessages((prev) => ({ ...prev, [def.id]: { ok: false, text: err } }));
        return;
      }
      changed[f.key] = parsed;
    }
    if (Object.keys(changed).length === 0) return;

    setSaving(def.id);
    try {
      const url = def.source === "battle" ? "/api/admin/battle-config" : "/api/admin/platform-settings";
      const body = def.source === "battle" ? changed : { section: def.id, config: changed };
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) throw new Error(json.error || `HTTP ${res.status}`);
      setBaseline((prev) => ({
        ...prev,
        [def.id]: { ...prev[def.id], ...(values[def.id] || {}) },
      }));
      const n = Object.keys(changed).length;
      setMessages((prev) => ({
        ...prev,
        [def.id]: { ok: true, text: `${n} setting${n === 1 ? "" : "s"} saved — change is audit-logged` },
      }));
    } catch (e: any) {
      setMessages((prev) => ({ ...prev, [def.id]: { ok: false, text: e.message || "Save failed" } }));
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-xs text-ccb-muted">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
        Loading financial controls…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ccb-muted">
          Changes take effect immediately and are written to the audit log with your account.
        </p>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-1.5 rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs font-medium text-ccb-muted transition-colors hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reload
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {SECTIONS.map((def) => (
          <ControlCard
            key={def.id}
            def={def}
            values={values[def.id] || {}}
            dirty={isDirty(def)}
            saving={saving === def.id}
            message={messages[def.id] || null}
            onChange={(key, val) => handleChange(def, key, val)}
            onSave={() => saveSection(def)}
          />
        ))}
      </div>
    </div>
  );
}
