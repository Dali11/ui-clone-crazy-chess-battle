"use client";

import { useState } from "react";
import {
  ShieldAlert, Loader2, RefreshCw, Check, XCircle, RotateCcw,
  AlertTriangle, Smartphone, Timer, Users, Wallet,
} from "lucide-react";
import { flagTypeLabel } from "@/lib/integrity/detect";

export interface IntegrityOtherProfile {
  id: string;
  username: string | null;
  display_name: string | null;
  country: string | null;
  wallet_balance: number | null;
  is_banned: boolean | null;
}

export interface IntegrityFlag {
  id: string;
  user_id: string;
  type: string;
  severity: "low" | "medium" | "high";
  status: "open" | "dismissed" | "confirmed";
  details: Record<string, any>;
  created_at: string;
  updated_at: string;
  heldPayouts: number;
  profiles?: { username: string | null; display_name: string | null; country: string | null; wallet_balance: number | null; is_banned: boolean | null } | null;
  otherProfiles?: IntegrityOtherProfile[];
}

interface IntegrityPanelProps {
  flags: IntegrityFlag[];
  loading: boolean;
  scanLoading: boolean;
  scanResult: Record<string, any> | null;
  onScan: () => Promise<void>;
  onAction: (flagId: string, action: "dismiss" | "confirm" | "reopen") => Promise<void>;
  actionLoading: string | null;
  formatDate: (d: string) => string;
}

const SEVERITY_STYLES: Record<string, string> = {
  high: "bg-ccb-danger/15 text-ccb-danger border-ccb-danger/30",
  medium: "bg-ccb-accent/15 text-ccb-accent border-ccb-accent/30",
  low: "bg-ccb-muted text-ccb-muted border-ccb-muted/30",
};

const STATUS_STYLES: Record<string, string> = {
  open: "bg-ccb-accent/15 text-ccb-accent",
  dismissed: "bg-ccb-success/15 text-ccb-success",
  confirmed: "bg-ccb-danger/15 text-ccb-danger",
};

export default function IntegrityPanel({
  flags, loading, scanLoading, scanResult, onScan, onAction, actionLoading,
  formatDate,
}: IntegrityPanelProps) {
  const [showResolved, setShowResolved] = useState(false);
  const visible = flags.filter((f) => showResolved || f.status === "open");

  return (
    <div className="space-y-4">
      {/* Header + scan */}
      <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-ccb-accent" />
            <h2 className="text-base font-bold">Player Integrity</h2>
          </div>
          <p className="text-xs text-ccb-muted mt-1">
            Anti-cheat signals: shared payment phones (alt accounts) and robotic move rhythm (engine suspicion).
            Open flags hold league payouts and block withdrawals until you resolve them.
          </p>
        </div>
        <button
          onClick={onScan}
          disabled={scanLoading}
          className="inline-flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-lg bg-ccb-primary text-white hover:opacity-90 disabled:opacity-50"
        >
          {scanLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {scanLoading ? "Scanning…" : "Run scan"}
        </button>
      </div>

      {scanResult && (
        <div className="card p-3 text-xs text-ccb-muted flex flex-wrap gap-x-4 gap-y-1">
          <span>Scanned: <b>{scanResult.scanned?.successfulDeposits ?? 0}</b> deposits, <b>{scanResult.scanned?.withdrawals ?? 0}</b> withdrawals, <b>{scanResult.scanned?.finishedGames ?? 0}</b> finished games</span>
          <span>Phone clusters: <b>{scanResult.phoneClusters ?? 0}</b></span>
          <span>New flags: <b>{scanResult.flagsCreated ?? 0}</b> · refreshed: <b>{scanResult.flagsRefreshed ?? 0}</b></span>
          <span>Open flags: <b>{scanResult.openFlags ?? 0}</b></span>
        </div>
      )}

      {/* Show-resolved toggle */}
      <label className="flex items-center gap-2 text-xs text-ccb-muted cursor-pointer select-none">
        <input
          type="checkbox"
          checked={showResolved}
          onChange={(e) => setShowResolved(e.target.checked)}
          className="accent-ccb-primary"
        />
        Show dismissed / confirmed flags
      </label>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-ccb-muted" /></div>
      ) : visible.length === 0 ? (
        <div className="card p-8 text-center">
          <ShieldAlert className="h-10 w-10 mx-auto text-ccb-success mb-2" />
          <p className="text-sm font-bold">No open integrity flags</p>
          <p className="text-xs text-ccb-muted mt-1">Run a scan after each league settle (or anytime) to check for alt accounts and engine play.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((f) => (
            <div key={f.id} className="card p-4" style={{
              borderLeft: `4px solid ${f.severity === "high" ? "#ef4444" : f.severity === "medium" ? "#f59e0b" : "#94a3b8"}`,
            }}>
              <div className="flex flex-wrap items-center gap-2">
                {f.type === "shared_phone" ? <Smartphone className="h-4 w-4 text-ccb-primary" /> : <Timer className="h-4 w-4 text-ccb-primary" />}
                <span className="text-sm font-bold">@{f.profiles?.username || f.user_id.slice(0, 8)}</span>
                {f.profiles?.country && <span className="text-[10px] text-ccb-muted">{f.profiles.country}</span>}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${SEVERITY_STYLES[f.severity]}`}>
                  {f.severity.toUpperCase()}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${STATUS_STYLES[f.status]}`}>{f.status}</span>
                {f.heldPayouts > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-ccb-accent/15 text-ccb-accent inline-flex items-center gap-1">
                    <Wallet className="h-3 w-3" /> {f.heldPayouts} payout{f.heldPayouts > 1 ? "s" : ""} held
                  </span>
                )}
                <span className="ml-auto text-[10px] text-ccb-muted">{formatDate(f.created_at)}</span>
              </div>

              <p className="text-xs text-ccb-muted mt-2">{flagTypeLabel(f.type)}</p>

              {/* Evidence */}
              <div className="text-xs text-ccb-muted mt-2 space-y-1">
                {f.type === "shared_phone" && (
                  <>
                    <p>Shared phone: <b className="text-ccb-primary">0{f.details?.phone}</b> — this account: {f.details?.evidence?.deposits ?? 0} deposit(s), {f.details?.evidence?.withdrawals ?? 0} withdrawal(s)</p>
                    {(f.details?.crossGames ?? 0) > 0 && (
                      <p className="text-ccb-danger flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" /> {f.details.crossGames} game/battle points BETWEEN the linked accounts — strong farm pattern.
                      </p>
                    )}
                    {f.otherProfiles && f.otherProfiles.length > 0 && (
                      <p className="flex items-center gap-1 flex-wrap">
                        <Users className="h-3 w-3" /> Linked accounts:
                        {f.otherProfiles.map((o) => (
                          <span key={o.id} className="inline-flex items-center gap-1">
                            <b>@{o.username || o.id.slice(0, 8)}</b>
                            {o.country && <span className="text-[10px]">({o.country})</span>}
                            {o.is_banned && <span className="text-[10px] text-ccb-danger">[banned]</span>}
                          </span>
                        ))}
                      </p>
                    )}
                  </>
                )}
                {f.type === "robotic_move_times" && (
                  <p>Game {f.details?.gameId?.slice(0, 8)} ({f.details?.timeControl}): {f.details?.reason}</p>
                )}
              </div>

              {/* Actions */}
              {f.status === "open" ? (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => onAction(f.id, "dismiss")}
                    disabled={actionLoading === f.id}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-ccb-success/15 text-ccb-success hover:bg-ccb-success/25 disabled:opacity-50"
                  >
                    {actionLoading === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Dismiss{f.heldPayouts > 0 ? " + release payout" : ""}
                  </button>
                  <button
                    onClick={() => onAction(f.id, "confirm")}
                    disabled={actionLoading === f.id}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-ccb-danger/15 text-ccb-danger hover:bg-ccb-danger/25 disabled:opacity-50"
                  >
                    {actionLoading === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
                    Confirm cheating
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={() => onAction(f.id, "reopen")}
                    disabled={actionLoading === f.id}
                    className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-ccb-muted/15 text-ccb-muted hover:opacity-80 disabled:opacity-50"
                  >
                    {actionLoading === f.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                    Reopen
                  </button>
                  <span className="text-[10px] text-ccb-muted">Payout stays held until dismissed (release) or manually settled.</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-ccb-muted">
        How it works: scans compare mobile money numbers on deposits/withdrawals (the same SIM across 2+ accounts is alt-account
        evidence) and per-move think-time rhythm from finished games. Flags are advisory — dismissing releases any held payouts
        instantly; confirming keeps them held (ban the player from the Players tab if warranted).
      </p>
    </div>
  );
}
