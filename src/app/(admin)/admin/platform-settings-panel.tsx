"use client";

import { useState, useEffect, useCallback } from "react";
import { Settings, Save, Loader2, SlidersHorizontal } from "lucide-react";

// ─── Field definitions ────────────────────────────────────────────────────

interface SettingField {
  key: string;
  label: string;
  type: "toggle" | "number" | "text" | "select" | "textarea";
  options?: { value: string; label: string }[];
  help?: string;
  group?: "control" | "pricing" | "display";
  unit?: string;
}

const SECTION_FIELDS: Record<string, SettingField[]> = {
  ads: [
    { key: "enabled", label: "Ads Enabled (Global)", type: "toggle", group: "control", help: "Master switch — nothing renders anywhere when off" },
    { key: "lobby_enabled", label: "Lobby Ad", type: "toggle", group: "control", help: "Dashboard lobby — recommended 320x50 mobile / 728x90 desktop banner" },
    { key: "lobby_script", label: "Lobby Ad Script", type: "textarea", group: "control", help: "Paste the full Adsterra snippet" },
    { key: "spectate_enabled", label: "Spectate / Live List Ad", type: "toggle", group: "control", help: "Live games browsing page — recommended native banner 300x250" },
    { key: "spectate_script", label: "Spectate Ad Script", type: "textarea", group: "control" },
    { key: "game_results_enabled", label: "Chess Results Ad", type: "toggle", group: "control", help: "Shown on the end-of-game screen after casual/free games — recommended 300x250" },
    { key: "game_results_script", label: "Chess Results Ad Script", type: "textarea", group: "control" },
    { key: "battle_settlement_enabled", label: "Battle Settlement Ad", type: "toggle", group: "control", help: "End-of-game screen for staked battles — recommended 300x250" },
    { key: "battle_settlement_script", label: "Battle Settlement Ad Script", type: "textarea", group: "control" },
    { key: "draughts_results_enabled", label: "Draughts Results Ad", type: "toggle", group: "control", help: "End-of-game screen for draughts — recommended 300x250" },
    { key: "draughts_results_script", label: "Draughts Results Ad Script", type: "textarea", group: "control" },
  ],
  overview: [
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle", group: "display", help: "Display stat cards at the top" },
    { key: "refresh_interval_seconds", label: "Refresh Interval", type: "number", group: "display", unit: "sec", help: "Auto-refresh stats every N seconds" },
  ],
  deposits: [
    { key: "enabled", label: "Deposits Enabled", type: "toggle", group: "control", help: "Allow new deposit requests" },
    { key: "auto_credit", label: "Auto-Credit", type: "toggle", group: "control", help: "Automatically credit approved deposits" },
    { key: "min_amount", label: "Minimum Deposit", type: "number", group: "control", unit: "MWK" },
    { key: "max_amount", label: "Maximum Deposit", type: "number", group: "control", unit: "MWK" },
    { key: "require_approval_above", label: "Approval Threshold", type: "number", group: "control", unit: "MWK", help: "Deposits above this require manual approval" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle", group: "display" },
    { key: "default_filter", label: "Default Filter", type: "select", group: "display", options: [
      { value: "all", label: "All" }, { value: "pending", label: "Pending" },
      { value: "success", label: "Successful" }, { value: "failed", label: "Failed" },
    ]},
    { key: "page_size", label: "Page Size", type: "number", group: "display", help: "Records per page" },
  ],
  withdrawals: [
    { key: "enabled", label: "Withdrawals Enabled", type: "toggle", group: "control", help: "Allow new withdrawal requests" },
    { key: "auto_approve", label: "Auto-Approve", type: "toggle", group: "control", help: "Automatically approve and process withdrawals" },
    { key: "min_amount", label: "Minimum Withdrawal", type: "number", group: "control", unit: "MWK" },
    { key: "max_amount", label: "Maximum Withdrawal", type: "number", group: "control", unit: "MWK" },
    { key: "daily_limit", label: "Daily Limit", type: "number", group: "control", unit: "MWK", help: "Max total withdrawals per user per day" },
    { key: "processing_fee_pct", label: "Processing Fee", type: "number", group: "control", unit: "%" },
    { key: "withdrawal_fee", label: "Withdrawal Fee", type: "number", group: "control", unit: "MWK", help: "Flat fee per withdrawal" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle", group: "display" },
    { key: "default_filter", label: "Default Filter", type: "select", group: "display", options: [
      { value: "all", label: "All" }, { value: "pending", label: "Pending" },
      { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" },
    ]},
    { key: "page_size", label: "Page Size", type: "number", group: "display", help: "Records per page" },
  ],
  battles: [
    { key: "enabled", label: "Battles Enabled", type: "toggle", group: "control", help: "Allow staked battles" },
    { key: "min_stake", label: "Min Stake", type: "number", group: "control", unit: "MWK" },
    { key: "max_stake", label: "Max Stake", type: "number", group: "control", unit: "MWK" },
    { key: "platform_fee_pct", label: "Platform Fee", type: "number", group: "control", unit: "%", help: "Platform cut of each battle" },
    { key: "auto_cancel_minutes", label: "Auto-Cancel", type: "number", group: "control", unit: "min", help: "Cancel unmatched battles after N minutes" },
    { key: "stake_levels", label: "Stake Levels (comma-separated)", type: "text", group: "control", help: "MWK values players can choose: 500,1000,2000,5000,10000" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle", group: "display" },
    { key: "page_size", label: "Page Size", type: "number", group: "display", help: "Records per page" },
  ],
  games: [
    { key: "allow_spectators", label: "Allow Spectators", type: "toggle", group: "control" },
    { key: "max_concurrent_games", label: "Max Concurrent Games", type: "number", group: "control" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle", group: "display" },
    { key: "default_filter", label: "Default Filter", type: "select", group: "display", options: [
      { value: "all", label: "All" }, { value: "active", label: "Active" },
      { value: "completed", label: "Completed" },
    ]},
    { key: "page_size", label: "Page Size", type: "number", group: "display", help: "Records per page" },
  ],
  users: [
    { key: "allow_signup", label: "Allow Signups", type: "toggle", group: "control", help: "Allow new user registrations" },
    { key: "require_email_verification", label: "Require Email Verification", type: "toggle", group: "control" },
    { key: "default_is_admin", label: "New Users Admin", type: "toggle", group: "control", help: "Dangerous — new users get admin access" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle", group: "display" },
    { key: "page_size", label: "Page Size", type: "number", group: "display", help: "Records per page" },
  ],
  tournaments: [
    { key: "require_approval", label: "Require Approval", type: "toggle", group: "control", help: "Tournaments need admin approval before going live" },
    { key: "auto_approve_below_players", label: "Auto-Approve Under", type: "number", group: "control", unit: "players", help: "Auto-approve tournaments with fewer than N players" },
    { key: "max_players", label: "Max Players", type: "number", group: "control" },
    { key: "default_entry_fee", label: "Default Entry Fee", type: "number", group: "pricing", help: "Base currency entry fee for auto-created tournaments (0 = free)" },
    { key: "max_entry_fee", label: "Max Entry Fee", type: "number", group: "pricing", help: "Maximum entry fee users can set when creating a tournament" },
    { key: "min_entry_fee", label: "Min Entry Fee", type: "number", group: "pricing", help: "Minimum entry fee (0 allows free tournaments)" },
    { key: "default_creator_profit_pct", label: "Default Creator Profit %", type: "number", group: "pricing", help: "Default % of entry fees taken as platform/creator cut" },
    { key: "auto_create_time_control", label: "Auto-Create Time Control", type: "text", group: "pricing", help: "Time control for auto-created tournaments (rapid/blitz/bullet)" },
    { key: "auto_create_initial_minutes", label: "Auto-Create Minutes", type: "number", group: "pricing", help: "Initial minutes for auto-created tournament games" },
    { key: "auto_create_increment_seconds", label: "Auto-Create Increment (s)", type: "number", group: "pricing", help: "Increment seconds for auto-created tournament games" },
    { key: "auto_create_max_players", label: "Auto-Create Max Players", type: "number", group: "pricing" },
    { key: "auto_create_min_players", label: "Auto-Create Min Players", type: "number", group: "pricing" },
    { key: "auto_create_creator_profit_pct", label: "Auto-Create Creator Profit %", type: "number", group: "pricing" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle", group: "display" },
    { key: "page_size", label: "Page Size", type: "number", group: "display", help: "Records per page" },
  ],
  leagues: [
    { key: "require_membership", label: "Require Membership", type: "toggle", group: "control" },
    { key: "auto_relegate", label: "Auto-Relegate", type: "toggle", group: "control", help: "Auto-relegate inactive members" },
    { key: "promotion_spots", label: "Promotion Spots", type: "number", group: "control" },
    { key: "relegation_spots", label: "Relegation Spots", type: "number", group: "control" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle", group: "display" },
    { key: "page_size", label: "Page Size", type: "number", group: "display", help: "Records per page" },
  ],
  seasons: [
    { key: "auto_create", label: "Auto-Create Seasons", type: "toggle", group: "control" },
    { key: "default_duration_weeks", label: "Default Duration", type: "number", group: "control", unit: "weeks" },
    { key: "allow_overlap", label: "Allow Overlap", type: "toggle", group: "control", help: "Allow overlapping seasons" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle", group: "display" },
    { key: "page_size", label: "Page Size", type: "number", group: "display", help: "Records per page" },
  ],
  membership: [
    { key: "monthly_price", label: "Monthly Price", type: "number", group: "control", unit: "MWK", help: "Monthly membership fee in MWK" },
    { key: "yearly_price", label: "Yearly Price", type: "number", group: "control", unit: "MWK", help: "Yearly membership fee (2 months free)" },
    { key: "membership_active", label: "Membership Active", type: "toggle", group: "control", help: "Allow new membership purchases" },
    { key: "auto_renew", label: "Auto-Renew", type: "toggle", group: "control" },
    { key: "grace_period_days", label: "Grace Period", type: "number", group: "control", unit: "days" },
    { key: "require_verification", label: "Require Verification", type: "toggle", group: "control" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle", group: "display" },
    { key: "page_size", label: "Page Size", type: "number", group: "display", help: "Records per page" },
  ],
  verification: [
    { key: "require_id_document", label: "Require ID Document", type: "toggle", group: "control" },
    { key: "require_selfie", label: "Require Selfie", type: "toggle", group: "control" },
    { key: "auto_approve_trusted", label: "Auto-Approve Trusted", type: "toggle", group: "control", help: "Auto-approve users from trusted sources" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle", group: "display" },
    { key: "page_size", label: "Page Size", type: "number", group: "display", help: "Records per page" },
  ],
  logs: [
    { key: "retention_days", label: "Retention Period", type: "number", group: "control", unit: "days", help: "Auto-delete logs older than N days" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle", group: "display" },
    { key: "page_size", label: "Page Size", type: "number", group: "display", help: "Records per page" },
  ],
};

// ─── Display helpers ──────────────────────────────────────────────────────

function formatValue(value: any, unit?: string): string {
  if (unit === "MWK") return `MWK ${value.toLocaleString()}`;
  if (unit === "%") return `${value}%`;
  if (unit === "days") return `${value} day${value !== 1 ? "s" : ""}`;
  if (unit === "weeks") return `${value} week${value !== 1 ? "s" : ""}`;
  if (unit === "min") return `${value} min`;
  if (unit === "sec") return `${value} sec`;
  if (unit === "players") return `${value} players`;
  return String(value ?? "");
}

const SECTION_LABELS: Record<string, string> = {
  ads: "Ads",
  overview: "Overview",
  deposits: "Deposits",
  withdrawals: "Withdrawals",
  battles: "Battles",
  games: "Games",
  users: "Users",
  tournaments: "Tournaments",
  leagues: "Leagues",
  seasons: "Seasons",
  membership: "Membership",
  verification: "Verification",
  logs: "Admin Logs",
};

// ─── Component ────────────────────────────────────────────────────────────

export default function PlatformSettingsPanel({ section }: { section: string }) {
  const [config, setConfig] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const fields = SECTION_FIELDS[section] || [];
  const controlFields = fields.filter((f) => f.group !== "display");
  const displayFields = fields.filter((f) => f.group === "display");

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/platform-settings?section=${section}`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config || {});
      }
    } catch {
      // silent — settings just won't show
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, config }),
      });
      if (res.ok) {
        setToast({ msg: "Settings saved and enforced", ok: true });
      } else {
        setToast({ msg: "Failed to save", ok: false });
      }
    } catch {
      setToast({ msg: "Failed to save", ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 2500);
    }
  };

  const updateField = (key: string, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  // Get display value, handling arrays (e.g., stake_levels) by joining with commas
  const getDisplayValue = (field: SettingField): any => {
    const raw = config[field.key];
    if (raw === undefined || raw === null) return "";
    if (Array.isArray(raw)) return raw.join(",");
    if (field.unit === "MWK") return Math.floor(raw);
    return raw;
  };

  const setFieldValue = (field: SettingField, value: any) => {
    if (field.type === "text" && field.key === "stake_levels") {
      // Convert comma-separated string to number array
      const arr = value.split(",").map((v: string) => Number(v.trim())).filter((v: number) => !isNaN(v) && v > 0);
      updateField(field.key, arr);
    } else if (field.unit === "MWK") {
      updateField(field.key, Number(value));
    } else {
      updateField(field.key, value);
    }
  };

  if (loading || fields.length === 0) return null;

  return (
    <div className="mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs font-medium text-ccb-muted hover:text-ccb-text transition-colors py-1"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        {expanded ? "Hide Settings" : "Settings"}
      </button>

      {expanded && (
        <div className="mt-2 rounded-xl border border-ccb-border bg-ccb-surface/40 overflow-hidden">
          {/* Header bar */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-ccb-border bg-ccb-surface/60">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-ccb-primary" />
              <span className="text-sm font-semibold text-ccb-text">
                {SECTION_LABELS[section] || section} Settings
              </span>
            </div>
            {toast && (
              <span className={`text-xs font-medium ${toast.ok ? "text-ccb-success" : "text-red-400"}`}>
                {toast.msg}
              </span>
            )}
          </div>

          <div className="p-4 space-y-5">
            {/* Control settings */}
            {controlFields.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-[11px] uppercase tracking-wide font-semibold text-ccb-muted/70">Controls</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {controlFields.map((field) => (
                    <FieldRow
                      key={field.key}
                      field={field}
                      value={getDisplayValue(field)}
                      onChange={(v) => setFieldValue(field, v)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Display settings */}
            {displayFields.length > 0 && (
              <div className="space-y-2.5 pt-3 border-t border-ccb-border/60">
                <p className="text-[11px] uppercase tracking-wide font-semibold text-ccb-muted/70">Display</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {displayFields.map((field) => (
                    <FieldRow
                      key={field.key}
                      field={field}
                      value={getDisplayValue(field)}
                      onChange={(v) => setFieldValue(field, v)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Save button */}
            <div className="flex items-center gap-3 pt-2 border-t border-ccb-border/60">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-ccb-primary text-white hover:bg-ccb-primary/90 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save & Apply
              </button>
              {Object.keys(config).length > 0 && (
                <span className="text-[11px] text-ccb-muted/50">
                  Changes take effect immediately
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Field Row ────────────────────────────────────────────────────────────

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: SettingField;
  value: any;
  onChange: (v: any) => void;
}) {
  return (
    <div className={`flex flex-col gap-1 ${field.type === "textarea" ? "sm:col-span-2" : ""}`}>
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-medium text-ccb-text">{field.label}</label>
        {field.help && (
          <span className="text-[10px] text-ccb-muted/50 italic" title={field.help}>
            ({field.help})
          </span>
        )}
      </div>

      {/* Toggle */}
      {field.type === "toggle" && (
        <button
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            value ? "bg-ccb-primary" : "bg-ccb-border"
          }`}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
              value ? "translate-x-4.5" : "translate-x-1"
            }`}
            style={{ transform: value ? "translateX(20px)" : "translateX(4px)" }}
          />
        </button>
      )}

      {/* Number with unit */}
      {field.type === "number" && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
            className="flex-1 min-w-0 px-2.5 py-1.5 text-sm rounded-lg bg-ccb-dark border border-ccb-border text-ccb-text focus:outline-none focus:border-ccb-primary transition-colors"
          />
          {field.unit && (
            <span className="text-xs text-ccb-muted shrink-0 w-8">{field.unit}</span>
          )}
        </div>
      )}

      {/* Text */}
      {field.type === "text" && (
        <input
          type="text"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm rounded-lg bg-ccb-dark border border-ccb-border text-ccb-text focus:outline-none focus:border-ccb-primary transition-colors"
        />
      )}

      {/* Textarea — full ad snippets */}
      {field.type === "textarea" && (
        <textarea
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          spellCheck={false}
          placeholder="Paste the ad network snippet here (full <script> block)"
          className="w-full px-2.5 py-1.5 text-xs font-mono rounded-lg bg-ccb-dark border border-ccb-border text-ccb-text focus:outline-none focus:border-ccb-primary transition-colors resize-y"
        />
      )}

      {/* Select */}
      {field.type === "select" && (
        <select
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2.5 py-1.5 text-sm rounded-lg bg-ccb-dark border border-ccb-border text-ccb-text focus:outline-none focus:border-ccb-primary transition-colors"
        >
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}
