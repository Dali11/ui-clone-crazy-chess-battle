"use client";

import { useState, useEffect, useCallback } from "react";
import { Settings, Save, Loader2, ToggleLeft, ToggleRight } from "lucide-react";

// ─── Section-specific settings field definitions ─────────────────────────────
interface SettingField {
  key: string;
  label: string;
  type: "toggle" | "number" | "text" | "select";
  options?: { value: string; label: string }[];
  help?: string;
}

const SECTION_FIELDS: Record<string, SettingField[]> = {
  overview: [
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle", help: "Display stat cards at the top" },
    { key: "refresh_interval_seconds", label: "Refresh Interval (sec)", type: "number", help: "Auto-refresh stats every N seconds" },
  ],
  deposits: [
    { key: "enabled", label: "Deposits Enabled", type: "toggle", help: "Allow new deposit requests" },
    { key: "auto_credit", label: "Auto-Credit", type: "toggle", help: "Automatically credit approved deposits" },
    { key: "min_amount_cents", label: "Min Amount (cents)", type: "number", help: "Minimum deposit in cents" },
    { key: "max_amount_cents", label: "Max Amount (cents)", type: "number", help: "Maximum deposit in cents" },
    { key: "require_approval_above_cents", label: "Approval Threshold (cents)", type: "number", help: "Deposits above this require manual approval" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle" },
    { key: "default_filter", label: "Default Filter", type: "select", options: [
      { value: "all", label: "All" },
      { value: "pending", label: "Pending" },
      { value: "success", label: "Successful" },
      { value: "failed", label: "Failed" },
    ]},
    { key: "page_size", label: "Page Size", type: "number", help: "Records per page" },
  ],
  withdrawals: [
    { key: "enabled", label: "Withdrawals Enabled", type: "toggle", help: "Allow new withdrawal requests" },
    { key: "auto_approve", label: "Auto-Approve", type: "toggle", help: "Automatically approve withdrawals" },
    { key: "min_amount_cents", label: "Min Amount (cents)", type: "number" },
    { key: "max_amount_cents", label: "Max Amount (cents)", type: "number" },
    { key: "daily_limit_cents", label: "Daily Limit (cents)", type: "number" },
    { key: "processing_fee_pct", label: "Processing Fee %", type: "number" },
    { key: "withdrawal_fee_cents", label: "Withdrawal Fee (cents)", type: "number" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle" },
    { key: "default_filter", label: "Default Filter", type: "select", options: [
      { value: "all", label: "All" },
      { value: "pending", label: "Pending" },
      { value: "approved", label: "Approved" },
      { value: "rejected", label: "Rejected" },
    ]},
    { key: "page_size", label: "Page Size", type: "number" },
  ],
  battles: [
    { key: "enabled", label: "Battles Enabled", type: "toggle", help: "Allow staked battles" },
    { key: "min_stake_cents", label: "Min Stake (cents)", type: "number" },
    { key: "max_stake_cents", label: "Max Stake (cents)", type: "number" },
    { key: "platform_fee_pct", label: "Platform Fee %", type: "number", help: "Platform cut of each battle" },
    { key: "auto_cancel_minutes", label: "Auto-Cancel (min)", type: "number", help: "Cancel unmatched battles after N minutes" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle" },
    { key: "page_size", label: "Page Size", type: "number" },
  ],
  games: [
    { key: "allow_spectators", label: "Allow Spectators", type: "toggle" },
    { key: "max_concurrent_games", label: "Max Concurrent Games", type: "number" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle" },
    { key: "default_filter", label: "Default Filter", type: "select", options: [
      { value: "all", label: "All" },
      { value: "active", label: "Active" },
      { value: "completed", label: "Completed" },
    ]},
    { key: "page_size", label: "Page Size", type: "number" },
  ],
  users: [
    { key: "allow_signup", label: "Allow Signups", type: "toggle" },
    { key: "require_email_verification", label: "Require Email Verification", type: "toggle" },
    { key: "default_is_admin", label: "New Users Admin", type: "toggle", help: "Dangerous — new users get admin access" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle" },
    { key: "page_size", label: "Page Size", type: "number" },
  ],
  tournaments: [
    { key: "require_approval", label: "Require Approval", type: "toggle", help: "Tournaments need admin approval" },
    { key: "auto_approve_below_players", label: "Auto-Approve Under N Players", type: "number" },
    { key: "max_players", label: "Max Players", type: "number" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle" },
    { key: "page_size", label: "Page Size", type: "number" },
  ],
  berry: [
    { key: "berries_per_win", label: "Berries Per Win", type: "number" },
    { key: "berries_per_draw", label: "Berries Per Draw", type: "number" },
    { key: "berries_per_tournament_win", label: "Berries Per Tournament Win", type: "number" },
    { key: "daily_cap", label: "Daily Cap", type: "number", help: "Max berries per user per day" },
    { key: "conversion_rate", label: "Conversion Rate", type: "number", help: "Berries to 1 MWK" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle" },
  ],
  leagues: [
    { key: "require_membership", label: "Require Membership", type: "toggle" },
    { key: "auto_relegate", label: "Auto-Relegate", type: "toggle", help: "Auto-relegate inactive members" },
    { key: "promotion_spots", label: "Promotion Spots", type: "number" },
    { key: "relegation_spots", label: "Relegation Spots", type: "number" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle" },
    { key: "page_size", label: "Page Size", type: "number" },
  ],
  seasons: [
    { key: "auto_create", label: "Auto-Create Seasons", type: "toggle" },
    { key: "default_duration_weeks", label: "Default Duration (weeks)", type: "number" },
    { key: "allow_overlap", label: "Allow Overlap", type: "toggle", help: "Allow overlapping seasons" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle" },
    { key: "page_size", label: "Page Size", type: "number" },
  ],
  membership: [
    { key: "auto_renew", label: "Auto-Renew", type: "toggle" },
    { key: "grace_period_days", label: "Grace Period (days)", type: "number" },
    { key: "require_verification", label: "Require Verification", type: "toggle" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle" },
    { key: "page_size", label: "Page Size", type: "number" },
  ],
  verification: [
    { key: "require_id_document", label: "Require ID Document", type: "toggle" },
    { key: "require_selfie", label: "Require Selfie", type: "toggle" },
    { key: "auto_approve_trusted", label: "Auto-Approve Trusted", type: "toggle", help: "Auto-approve verified users" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle" },
    { key: "page_size", label: "Page Size", type: "number" },
  ],
  logs: [
    { key: "retention_days", label: "Retention (days)", type: "number", help: "Auto-delete logs older than N days" },
    { key: "page_size", label: "Page Size", type: "number" },
    { key: "show_kpi_cards", label: "Show KPI Cards", type: "toggle" },
  ],
};

export default function PlatformSettingsPanel({ section }: { section: string }) {
  const [config, setConfig] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fields = SECTION_FIELDS[section] || [];

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/platform-settings?section=${section}`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data.config || {});
      }
    } catch {
      // silent fail — settings just won't show
    } finally {
      setLoading(false);
    }
  }, [section]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/platform-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section, config }),
      });
      if (res.ok) {
        setToast("Settings saved");
        setTimeout(() => setToast(null), 2000);
      } else {
        setToast("Failed to save");
        setTimeout(() => setToast(null), 2000);
      }
    } catch {
      setToast("Failed to save");
      setTimeout(() => setToast(null), 2000);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key: string, value: any) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  if (loading || fields.length === 0) return null;

  return (
    <div className="mb-4">
      {/* Toggle button */}
      <button
        onClick={() => setShowSettings(!showSettings)}
        className="flex items-center gap-1.5 text-xs text-ccb-muted hover:text-ccb-text transition-colors"
      >
        <Settings className="w-3.5 h-3.5" />
        {showSettings ? "Hide Settings" : "Section Settings"}
      </button>

      {showSettings && (
        <div className="mt-3 rounded-xl border border-ccb-border bg-ccb-surface/50 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ccb-text">Platform Settings — {section}</h3>
            {toast && <span className="text-xs text-ccb-success">{toast}</span>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fields.map((field) => (
              <div key={field.key} className="space-y-1">
                <label className="text-xs font-medium text-ccb-muted flex items-center gap-1">
                  {field.label}
                  {field.help && (
                    <span className="text-[10px] text-ccb-muted/60 italic" title={field.help}>
                      ⓘ
                    </span>
                  )}
                </label>

                {field.type === "toggle" && (
                  <button
                    onClick={() => updateField(field.key, !config[field.key])}
                    className="flex items-center gap-1"
                  >
                    {config[field.key] ? (
                      <ToggleRight className="w-9 h-5 text-ccb-success" />
                    ) : (
                      <ToggleLeft className="w-9 h-5 text-ccb-border" />
                    )}
                    <span className="text-xs text-ccb-muted">{config[field.key] ? "On" : "Off"}</span>
                  </button>
                )}

                {field.type === "number" && (
                  <input
                    type="number"
                    value={config[field.key] ?? ""}
                    onChange={(e) => updateField(field.key, Number(e.target.value))}
                    className="w-full px-2.5 py-1.5 text-sm rounded-lg bg-ccb-dark border border-ccb-border text-ccb-text focus:outline-none focus:border-ccb-primary"
                  />
                )}

                {field.type === "text" && (
                  <input
                    type="text"
                    value={config[field.key] ?? ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm rounded-lg bg-ccb-dark border border-ccb-border text-ccb-text focus:outline-none focus:border-ccb-primary"
                  />
                )}

                {field.type === "select" && (
                  <select
                    value={config[field.key] ?? ""}
                    onChange={(e) => updateField(field.key, e.target.value)}
                    className="w-full px-2.5 py-1.5 text-sm rounded-lg bg-ccb-dark border border-ccb-border text-ccb-text focus:outline-none focus:border-ccb-primary"
                  >
                    {field.options?.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-ccb-primary text-white hover:bg-ccb-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save Settings
          </button>
        </div>
      )}
    </div>
  );
}
