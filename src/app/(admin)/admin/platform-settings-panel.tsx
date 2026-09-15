"use client";

import { useState, useEffect, useCallback } from "react";
import { Settings, Save, Loader2, SlidersHorizontal } from "lucide-react";

// ─── Field definitions ────────────────────────────────────────────────────

interface SettingField {
  key: string;
  label: string;
  type: "toggle" | "number" | "text" | "select" | "textarea" | "numberArray";
  options?: { value: string; label: string }[];
  help?: string;
  group?: "control" | "pricing" | "display";
  unit?: string;
}

const SECTION_FIELDS: Record<string, SettingField[]> = {
  push: [
    { key: "enabled", label: "Push notifications", type: "toggle", group: "control", help: "Master switch — off kills all device notifications" },
    { key: "dm_gap_min", label: "DM gap", type: "number", unit: "min", group: "control", help: "Min minutes between DM notifications per conversation (0 = always)" },
    { key: "group_gap_min", label: "Group gap", type: "number", unit: "min", group: "control", help: "Max one notification per room per player in this window" },
    { key: "turn_gap_min", label: "Turn reminder gap", type: "number", unit: "min", group: "control", help: "Max one 'your move' per game in this window" },
  ],
  revenue_sweep: [
    { key: "enabled", label: "Weekly sweep enabled", type: "toggle", group: "control", help: "Cron runs Mon 00:15 CAT. OFF until you set a payout destination below" },
    { key: "auto_payout", label: "Auto-execute payout", type: "toggle", group: "control", help: "ON = money sent to your number automatically. OFF = weekly withdrawal created pending for one-click approval" },
    { key: "min_mwk", label: "Minimum sweep amount", type: "number", unit: "MWK", group: "control", help: "Windows below this carry over to the next week" },
    { key: "dest_phone", label: "Payout mobile number", type: "text", group: "control", help: "Your Malawi mobile money number (08x TNM, 09x Airtel)" },
    {
      key: "dest_provider", label: "Payout provider", type: "select", group: "control",
      options: [
        { value: "paychangu", label: "PayChangu (MW mobile money)" },
        { value: "pawapay", label: "PawaPay" },
      ],
      help: "Where the automatic payout executes",
    },
    { key: "owner_user_id", label: "Owner user ID", type: "text", group: "control", help: "Who receives revenue. Empty = your admin account (Arthur)" },
    { key: "epoch", label: "First sweep starts from", type: "text", group: "control", help: "ISO date — revenue earned after this is swept (only used before the first credited sweep)" },
  ],
  integrity: [
    { key: "owner_usernames", label: "Owner / test account whitelist", type: "text", group: "control", help: "Comma-separated usernames that integrity scans never flag (your own accounts + test accounts — they legitimately share phones and play each other while testing). Case-insensitive" },
  ],
  affiliate: [
    { key: "enabled", label: "Affiliate commissions enabled", type: "toggle", group: "control", help: "ON = membership purchases pay the buyer's referrer 25% of the charged amount ($2.50 per $10 sale) to their wallet. Referral tracking works while OFF; only payouts pause" },
  ],
  direct_ads: [
    { key: "enabled", label: "Self-serve direct ads enabled", type: "toggle", group: "control", help: "ON = /advertise sells flat weekly campaigns from wallet balance; paid campaigns take priority over the ad network in every slot" },
    { key: "price_per_week_mwk", label: "Price per week", type: "number", unit: "MWK", group: "control", help: "Base weekly rate. 2 weeks = 1.9x, 4 weeks = 3.5x (rounded to MK50)" },
  ],
  membership: [
    { key: "enabled", label: "Membership purchases enabled", type: "toggle", group: "control", help: "Master switch — OFF hides the buy form and blocks the purchase API" },
    { key: "price_usd", label: "Price", type: "number", unit: "USD", group: "control", help: "Charged per period via Malawi mobile money (PayChangu), converted to MWK at the live rate at charge time. Revenue is swept weekly with fees" },
    { key: "period_days", label: "Period", type: "number", unit: "days", group: "control", help: "Days each purchase adds (renewals stack — no lost days)" },
  ],
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
    { key: "challenge_finished_enabled", label: "Challenge Finished Ad", type: "toggle", group: "control", help: "Shown when someone opens a challenge link after the game ended — falls back to the Chess Results ad if no script is set" },
    { key: "challenge_finished_script", label: "Challenge Finished Ad Script", type: "textarea", group: "control" },
    { key: "leagues_enabled", label: "Leagues Page Ad", type: "toggle", group: "control", help: "Bottom of the League page (weekly + monthly leaderboards) and tournaments page — recommended 320x50 mobile / 728x90 desktop" },
    { key: "leagues_script", label: "Leagues Ad Script", type: "textarea", group: "control", help: "Paste the full Adsterra snippet" },
    { key: "leagues_inline_enabled", label: "Leagues Inline Ad", type: "toggle", group: "control", help: "Mid-feed slot: between league cards on Overview, and between rewards + standings on My League — configured separately since it needs a SMALLER unit (recommended 300x100 or native, not 300x250)" },
    { key: "leagues_inline_script", label: "Leagues Inline Ad Script", type: "textarea", group: "control", help: "Paste a SMALL Adsterra snippet — this renders between compact cards, not at the bottom of the page" },
    { key: "frequency_min_gap_sec", label: "Min Gap Between Ads", type: "number", group: "control", unit: "sec", help: "Cooldown between any two ads for the same player, across all placements" },
    { key: "frequency_hourly_cap", label: "Hourly Cap (per player)", type: "number", group: "control", unit: "ads", help: "Max ad impressions per rolling hour, all placements combined. 0 = unlimited" },
    { key: "frequency_daily_cap", label: "Daily Cap (per player)", type: "number", group: "control", unit: "ads", help: "Max ad impressions per rolling 24h, all placements combined. 0 = unlimited" },
    { key: "results_every_n", label: "Results Ad Every Nth Game", type: "number", group: "control", unit: "games", help: "Show the end-of-game ad only on every Nth finished game (chess, draughts, battles). 1 = every game" },
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
  leagues_xp: [
    { key: "enabled", label: "XP Leagues Enabled", type: "toggle", group: "control", help: "Master switch — no XP is earned or displayed anywhere when off" },
    { key: "xp_win", label: "XP per Win", type: "number", group: "control" },
    { key: "xp_draw", label: "XP per Draw", type: "number", group: "control" },
    { key: "xp_loss", label: "XP per Loss", type: "number", group: "control", help: "Negative values deduct XP for a loss (e.g. -1). Weekly standings never go below 0." },
    { key: "xp_upset_bonus", label: "Upset Bonus", type: "number", group: "control", help: "Extra XP for beating a higher-rated player" },
    { key: "daily_xp_cap", label: "Daily XP Cap", type: "number", group: "control", help: "Anti-farming: max XP a player can earn per day" },
    { key: "promote_count", label: "Rewarded Spots", type: "number", group: "control", help: "Top N rewarded each week (default 5). They also move up a tier only while Standard Promotion/Relegation is on." },
    { key: "demote_count", label: "Demotion Spots", type: "number", group: "control", help: "Bottom N demoted each week — only applies while Standard Promotion/Relegation is on" },
    { key: "tier_moves_enabled", label: "Standard Promotion/Relegation", type: "toggle", group: "control", help: "Top-N promote / bottom-N demote each week. OFF while building the player base — rosters move via fair-share rebalance only, rewards still pay. Flip ON once Premier approaches the 1k cap." },
    { key: "tier_cap", label: "League Size Cap", type: "number", group: "control", help: "Max players per league above the Open League (default 1000; Open is unlimited). Promotion pauses when the league above is full." },
    { key: "rewards_enabled", label: "Cash Rewards Enabled", type: "toggle", group: "pricing", help: "Master display + payout switch for rewards" },
    { key: "weekly_payouts_enabled", label: "Weekly Payout Kill-Switch", type: "toggle", group: "pricing", help: "OFF = the league, XP and leaderboards run as normal and reward amounts stay displayed, but NO wallet credits on settle. Use to skip weeks without revealing it to players." },
    { key: "rewards_t1_mwk", label: "🌍 Open League Rewards", type: "numberArray", group: "pricing", unit: "MWK", help: "Comma-separated payouts for 1st–5th place, e.g. 2000,1000,500,250,100" },
    { key: "rewards_t2_mwk", label: "🎯 Amateur League Rewards", type: "numberArray", group: "pricing", unit: "MWK" },
    { key: "rewards_t3_mwk", label: "🥉 Bronze League Rewards", type: "numberArray", group: "pricing", unit: "MWK" },
    { key: "rewards_t4_mwk", label: "♞ Knights Championship Rewards", type: "numberArray", group: "pricing", unit: "MWK" },
    { key: "rewards_t5_mwk", label: "🏆 Premier League Rewards", type: "numberArray", group: "pricing", unit: "MWK", help: "Each league pays its own weekly rewards — higher leagues, bigger payouts. Players see these amounts in their own currency." },
    { key: "monthly_rewards_enabled", label: "Monthly Championship Enabled", type: "toggle", group: "pricing", help: "Monthly rankings always run; this toggle controls the cash PAYOUTS, which land on the 30th of each month when on. Tiers only move on the weekly cycle." },
    { key: "monthly_top_count", label: "Monthly Paid Spots", type: "number", group: "pricing", help: "Top N players per league earn monthly rewards (default 5)" },
    { key: "monthly_rewards_t1_mwk", label: "🌍 Open League Monthly Rewards", type: "numberArray", group: "pricing", unit: "MWK", help: "Comma-separated monthly payouts for 1st–5th, e.g. 8000,4000,2000,1000,500" },
    { key: "monthly_rewards_t2_mwk", label: "🎯 Amateur League Monthly Rewards", type: "numberArray", group: "pricing", unit: "MWK" },
    { key: "monthly_rewards_t3_mwk", label: "🥉 Bronze League Monthly Rewards", type: "numberArray", group: "pricing", unit: "MWK" },
    { key: "monthly_rewards_t4_mwk", label: "♞ Knights Championship Monthly Rewards", type: "numberArray", group: "pricing", unit: "MWK" },
    { key: "monthly_rewards_t5_mwk", label: "🏆 Premier League Monthly Rewards", type: "numberArray", group: "pricing", unit: "MWK", help: "Each league has its own monthly payout — settled on the 1st of each month" },
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
  if (unit === "ZMW") return `K${value.toLocaleString()}`;
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
  direct_ads: "Direct Ads",
  overview: "Overview",
  deposits: "Deposits",
  withdrawals: "Withdrawals",
  battles: "Battles",
  games: "Games",
  users: "Users",
  tournaments: "Tournaments",
  leagues_xp: "XP Leagues",
  push: "Push Notifications",
  verification: "Verification",
  logs: "Admin Logs",
  revenue_sweep: "Revenue Sweep",
  membership: "Membership",
  affiliate: "Affiliate",
  integrity: "Integrity",
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
    if (field.type === "numberArray") {
      // Comma-separated payouts -> number array (allow 0 for empty slots)
      const arr = String(value).split(",").map((v: string) => Number(v.trim())).filter((v: number) => !isNaN(v) && v >= 0);
      updateField(field.key, arr);
    } else if (field.type === "text" && field.key === "stake_levels") {
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
            {/* Revenue sweep summary + history (custom block) */}
            {section === "revenue_sweep" && <RevenueSweepCard />}

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

      {/* Comma-separated number array (e.g. per-tier reward payouts) */}
      {field.type === "numberArray" && (
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="2000,1000,500,250,100"
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


// ─── Revenue Sweep card — summary, dry run, manual sweep, history ─────────

interface SweepSummary {
  allTime: { battleFees: number; withdrawalFees: number; total: number };
  swept: number;
  unswept: { battleFees: number; withdrawalFees: number; total: number };
  window: { startISO: string; endISO: string };
  history: {
    id: string;
    window_start: string;
    window_end: string;
    battle_fees_mwk: number;
    withdrawal_fees_mwk: number;
    total_mwk: number;
    credited: boolean;
    payout_status: string;
    notes?: string | null;
  }[];
}

function RevenueSweepCard() {
  const [data, setData] = useState<SweepSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/revenue-sweep");
      if (res.ok) setData(await res.json());
    } catch {}
  }, []);

  useEffect(() => { load(); }, [load]);

  const runSweep = async (dry: boolean) => {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/admin/revenue-sweep", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dry }),
      });
      const result = await res.json();
      if (!res.ok) {
        setMsg(result.error || "Failed");
      } else if (result.action === "disabled") {
        setMsg("Sweep is disabled — enable it above first");
      } else if (result.action === "dry") {
        setMsg(`Dry run: would sweep MK${(result.total || 0).toLocaleString()} (${result.windowStart?.slice(0, 10)} → ${result.windowEnd?.slice(0, 10)})`);
      } else {
        setMsg(`Swept MK${(result.total || 0).toLocaleString()} — payout: ${result.payoutStatus}`);
        load();
      }
    } catch {
      setMsg("Failed");
    } finally {
      setBusy(false);
    }
  };

  if (!data) return null;

  const statusLabel = (s: string) =>
    s === "paid" ? "text-emerald-400" :
    s === "pending" ? "text-amber-400" :
    s.startsWith("skipped") || s === "wallet_only" ? "text-ccb-muted" :
    s.includes("failed") ? "text-red-400" : "text-ccb-text";

  return (
    <div className="space-y-4">
      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-ccb-border bg-ccb-surface/60 p-3">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-ccb-muted/70">All-time revenue</p>
          <p className="text-lg font-bold text-ccb-text mt-0.5">MK{data.allTime.total.toLocaleString()}</p>
          <p className="text-[10px] text-ccb-muted">battles + withdrawal fees</p>
        </div>
        <div className="rounded-xl border border-ccb-border bg-ccb-surface/60 p-3">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-ccb-muted/70">Swept to owner</p>
          <p className="text-lg font-bold text-ccb-text mt-0.5">MK{data.swept.toLocaleString()}</p>
          <p className="text-[10px] text-ccb-muted">credited withdrawals</p>
        </div>
        <div className="rounded-xl border border-ccb-border bg-ccb-surface/60 p-3">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-ccb-muted/70">Unswept (next window)</p>
          <p className="text-lg font-bold text-ccb-primary mt-0.5">MK{data.unswept.total.toLocaleString()}</p>
          <p className="text-[10px] text-ccb-muted">since {data.window.startISO.slice(0, 10)}</p>
        </div>
        <div className="rounded-xl border border-ccb-border bg-ccb-surface/60 p-3">
          <p className="text-[10px] uppercase tracking-wide font-semibold text-ccb-muted/70">Next auto sweep</p>
          <p className="text-lg font-bold text-ccb-text mt-0.5">Mon 00:15</p>
          <p className="text-[10px] text-ccb-muted">weekly, CAT</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => runSweep(true)}
          disabled={busy}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-ccb-border bg-ccb-surface text-ccb-text hover:bg-ccb-surface/70 disabled:opacity-50"
        >
          {busy ? "..." : "Dry run (preview)"}
        </button>
        <button
          onClick={() => runSweep(false)}
          disabled={busy}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-ccb-primary text-white hover:bg-ccb-primary/90 disabled:opacity-50"
        >
          {busy ? "..." : "Run sweep now"}
        </button>
        {msg && <span className="text-xs text-ccb-muted">{msg}</span>}
      </div>

      {/* History */}
      {data.history.length > 0 && (
        <div className="rounded-xl border border-ccb-border overflow-hidden">
          <div className="px-3 py-2 bg-ccb-surface/60 border-b border-ccb-border">
            <p className="text-xs font-semibold text-ccb-text">Sweep history</p>
          </div>
          <div className="divide-y divide-ccb-border/60">
            {data.history.map((h) => (
              <div key={h.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                <span className="text-ccb-muted w-24 shrink-0">
                  {new Date(h.window_end).toLocaleDateString()}
                </span>
                <span className="text-ccb-muted flex-1">
                  {new Date(h.window_start).toLocaleDateString()} → {new Date(h.window_end).toLocaleDateString()}
                </span>
                <span className="text-ccb-muted shrink-0 hidden sm:inline">
                  battles MK{h.battle_fees_mwk.toLocaleString()} · fees MK{h.withdrawal_fees_mwk.toLocaleString()}
                </span>
                <span className="font-semibold text-ccb-text shrink-0">
                  MK{h.total_mwk.toLocaleString()}
                </span>
                <span className={`font-semibold shrink-0 w-24 text-right ${statusLabel(h.payout_status)}`}>
                  {h.payout_status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-ccb-muted/70">
        Ad revenue (Adsterra) is paid to your external account directly — not part of this sweep.
        Bank transfer: payouts go to your mobile money number (08x/09x); forward to your bank from your provider dashboard, or approve the pending withdrawal manually.
      </p>
    </div>
  );
}
