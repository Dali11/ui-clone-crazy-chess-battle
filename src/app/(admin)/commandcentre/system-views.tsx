"use client";

/**
 * Command Centre — System & Trust views (Phase: legacy-port).
 *
 * Self-fetching operational views that complete the Command Centre's
 * replacement of the legacy /admin panel: user management, integrity
 * flags, activity logs, leagues admin, job health and the full platform
 * settings hub. Each view reuses the existing operational components
 * and admin APIs — no duplicated business logic.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban, Bell, Loader2, RefreshCw, Search, ShieldAlert, TrendingUp, Users as UsersIcon,
  UserRound, Wallet, X, Check, Star, Swords, ScrollText,
} from "lucide-react";
import { countryFlag } from "@/lib/geo/flags";
import IntegrityPanel from "../admin/components/integrity-panel";
import LeaguesAdminPanel from "../admin/components/leagues-admin-panel";
import JobsPanel from "../admin/components/jobs-panel";
import PlatformSettingsHub from "../admin/components/platform-settings-hub";
import CommunityRoomsCard from "../admin/components/community-rooms-card";
import UserDetailModal from "../admin/user-detail-modal";
import { ActionButton } from "../admin/components/shared";

const formatMWK = (n: number | null | undefined) =>
  "MWK " + Math.round(Number(n || 0)).toLocaleString();

const fmtUsd = (n: number | null | undefined) =>
  "$" + (Math.round(Number(n || 0) * 100) / 100).toLocaleString();

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString();

/** small inline confirm dialog (replaces legacy window.confirm chain) */
function ConfirmModal({
  title, body, confirmLabel, danger, onConfirm, onClose,
}: { title: string; body: string; confirmLabel: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-ccb-card border border-ccb-border rounded-xl max-w-md w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-bold">{title}</h3>
        <p className="text-xs text-ccb-muted whitespace-pre-line">{body}</p>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg text-xs bg-ccb-surface border border-ccb-border text-ccb-muted">Cancel</button>
          <button
            onClick={onConfirm}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white ${danger ? "bg-ccb-danger" : "bg-ccb-primary"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** ─── USERS MANAGEMENT ─────────────────────────────────────────────────── */

interface UserRow {
  id: string; username: string; display_name: string; email: string;
  rating: number | null; games_played: number; wins: number; losses: number; draws: number;
  wallet_balance: number; wallet_balance_usd?: number; is_admin: boolean; is_banned: boolean;
  phone?: string | null; country?: string | null; created_at: string;
}

interface CountryOption { country: string; count: number; }

const STATUS_CHIPS = [
  { id: "all", label: "All" }, { id: "new", label: "New 30d" }, { id: "active", label: "Active" },
  { id: "admins", label: "Admins" }, { id: "banned", label: "Banned" }, { id: "negative", label: "Negative wallets" },
] as const;

export function UsersView() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [kpis, setKpis] = useState<Record<string, number> | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [country, setCountry] = useState("");
  const [countryOptions, setCountryOptions] = useState<CountryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmReq, setConfirmReq] = useState<null | { title: string; body: string; confirmLabel: string; danger?: boolean; run: () => Promise<void> }>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const pageSize = 50;

  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 350); return () => clearTimeout(t); }, [search]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status, sort, page: String(page), page_size: String(pageSize) });
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (country) params.set("country", country);
      const res = await fetch(`/api/admin/users?${params}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load users");
      setUsers(json.users || []);
      setKpis(json.kpis || null);
      setTotal(json.total ?? 0);
    } catch (e: any) {
      setToast({ kind: "error", text: e.message || "Failed to load users" });
    } finally {
      setLoading(false);
    }
  }, [status, sort, country, page, debouncedSearch]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  useEffect(() => {
    fetch("/api/admin/users/countries", { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => setCountryOptions(json.countries || []))
      .catch(() => {});
  }, []);

  const userAction = useCallback(async (userId: string, action: string, value?: any) => {
    setActionLoading(`${userId}_${action}`);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await fetchUsers();
      setToast({ kind: "ok", text: `User ${action} successful` });
    } catch (e: any) {
      setToast({ kind: "error", text: e.message || "Action failed" });
    } finally {
      setActionLoading(null);
      setConfirmReq(null);
    }
  }, [fetchUsers]);

  const deleteUser = useCallback(async (userId: string) => {
    setActionLoading(`${userId}_delete`);
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await fetchUsers();
      setToast({ kind: "ok", text: data.warning ? `User deleted (partial: ${data.warning})` : "User permanently deleted" });
    } catch (e: any) {
      setToast({ kind: "error", text: e.message || "Delete failed" });
    } finally {
      setActionLoading(null);
      setConfirmReq(null);
    }
  }, [fetchUsers]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="space-y-3">
      {toast && (
        <div className={`fixed top-4 right-4 z-[90] px-4 py-2 rounded-lg shadow-lg text-sm font-medium text-white ${toast.kind === "error" ? "bg-ccb-danger" : "bg-ccb-success"}`}>
          {toast.text}
        </div>
      )}

      {/* KPIs */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { label: "Total Users", value: kpis.total, sub: `${kpis.new_7d} new this week`, icon: UsersIcon },
            { label: "New (30d)", value: kpis.new_30d, sub: `${kpis.new_7d} in last 7 days`, icon: TrendingUp },
            { label: "Active Players", value: kpis.active_players, sub: "played ≥ 1 game", icon: Swords },
            { label: "Avg Rating", value: kpis.avg_rating, sub: `${kpis.admins} admin${kpis.admins === 1 ? "" : "s"}`, icon: Star },
            { label: "Wallet Liability", value: fmtUsd(kpis.wallet_liability), sub: `${kpis.negative_wallets} negative balance${kpis.negative_wallets === 1 ? "" : "s"}`, icon: Wallet },
            { label: "Banned", value: kpis.banned, sub: "suspended accounts", icon: Ban },
          ].map((k) => (
            <div key={k.label} className="card p-3">
              <div className="flex items-center gap-1.5 text-xs text-ccb-muted"><k.icon className="w-3.5 h-3.5" /> {k.label}</div>
              <div className="text-lg font-bold mt-1">{k.value}</div>
              <div className="text-[11px] text-ccb-muted">{k.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* Search + sort */}
      <div className="flex flex-col lg:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ccb-muted" />
          <input
            type="text" placeholder="Search by name, email... (searches all pages)"
            value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="w-full pl-10 pr-4 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm"
          />
        </div>
        <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(0); }} className="px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="rating">Highest rating</option>
          <option value="games">Most games</option>
          <option value="wallet">Wallet balance</option>
          <option value="username">Username A–Z</option>
        </select>
        <select value={country} onChange={(e) => { setCountry(e.target.value); setPage(0); }} className="px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm">
          <option value="">All countries</option>
          {countryOptions.map((c) => (
            <option key={c.country} value={c.country}>
              {countryFlag(c.country)} {c.country} ({c.count})
            </option>
          ))}
        </select>
      </div>

      {/* Status chips */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_CHIPS.map((c) => (
          <button key={c.id} onClick={() => { setStatus(c.id); setPage(0); }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              status === c.id ? "bg-ccb-primary text-ccb-dark font-bold" : "bg-ccb-surface border border-ccb-border text-ccb-muted hover:border-ccb-primary/40"
            }`}>
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 mx-auto text-ccb-muted animate-spin" /></div>
      ) : users.length === 0 ? (
        <div className="text-center py-12 text-ccb-muted text-sm"><UsersIcon className="w-8 h-8 mx-auto mb-2 opacity-50" /> No users found</div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <div key={u.id} className={`card ${u.is_banned ? "opacity-60" : ""} hover:border-ccb-primary/30 transition-colors`}>
              <div className="flex items-center justify-between cursor-pointer" onClick={() => setDetailId(u.id)}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center">
                    <span className="text-sm font-bold text-ccb-primary">{(u.display_name || u.username || "?").charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                    <div className="text-sm font-medium flex items-center gap-2">
                      {u.display_name || u.username}{countryFlag(u.country) && ` ${countryFlag(u.country)}`}
                      {u.is_admin && <span className="text-xs px-1.5 py-0.5 rounded bg-ccb-primary/20 text-ccb-primary font-bold">ADMIN</span>}
                      {u.is_banned && <span className="text-xs px-1.5 py-0.5 rounded bg-ccb-danger/20 text-ccb-danger font-bold">BANNED</span>}
                    </div>
                    <div className="text-xs text-ccb-muted">{u.email} · {u.rating || "Unrated"} elo · {u.games_played || 0} games · W{u.wins || 0}/L{u.losses || 0}/D{u.draws || 0}</div>
                  </div>
                </div>
                <div className="text-right text-sm font-medium">{fmtUsd(u.wallet_balance_usd)}</div>
              </div>
              <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-ccb-border">
                <ActionButton onClick={() => setDetailId(u.id)} loading={false} variant="primary">
                  <UserRound className="w-3.5 h-3.5" /> View Profile
                </ActionButton>
                <ActionButton
                  onClick={() => u.is_banned
                    ? userAction(u.id, "unban")
                    : setConfirmReq({
                        title: "Ban this user?",
                        body: `Suspend ${u.display_name || u.username}? They will be blocked from signing in until unbanned.`,
                        confirmLabel: "Ban user", danger: true,
                        run: () => userAction(u.id, "ban"),
                      })}
                  loading={actionLoading === `${u.id}_${u.is_banned ? "unban" : "ban"}`}
                  variant={u.is_banned ? "success" : "danger"}
                >
                  <Ban className="w-3.5 h-3.5" /> {u.is_banned ? "Unban" : "Ban"}
                </ActionButton>
                <ActionButton
                  onClick={() => setConfirmReq({
                    title: u.is_admin ? "Remove admin access?" : "Grant admin access?",
                    body: u.is_admin
                      ? `Remove admin privileges from ${u.display_name || u.username}? They lose access to this console immediately.`
                      : `Grant FULL admin access to ${u.display_name || u.username}? They will control money, users and settings.`,
                    confirmLabel: u.is_admin ? "Remove admin" : "Grant admin", danger: !u.is_admin,
                    run: () => userAction(u.id, "toggle_admin", !u.is_admin),
                  })}
                  loading={actionLoading === `${u.id}_toggle_admin`}
                  variant="default"
                >
                  <ShieldAlert className="w-3.5 h-3.5" /> {u.is_admin ? "Remove admin" : "Make admin"}
                </ActionButton>
              </div>
            </div>
          ))}

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                className="px-3 py-1.5 rounded-lg text-xs bg-ccb-surface border border-ccb-border disabled:opacity-40">Previous</button>
              <span className="text-xs text-ccb-muted">Page {page + 1} of {pages} · {total} users</span>
              <button onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}
                className="px-3 py-1.5 rounded-lg text-xs bg-ccb-surface border border-ccb-border disabled:opacity-40">Next</button>
            </div>
          )}
        </div>
      )}

      {confirmReq && (
        <ConfirmModal title={confirmReq.title} body={confirmReq.body} confirmLabel={confirmReq.confirmLabel}
          danger={confirmReq.danger} onClose={() => setConfirmReq(null)} onConfirm={confirmReq.run} />
      )}
      {detailId && (
        <UserDetailModal userId={detailId} onClose={() => setDetailId(null)}
          onAction={userAction} onDelete={deleteUser} actionLoading={actionLoading} formatMWK={formatMWK} />
      )}
    </section>
  );
}

/** ─── INTEGRITY ────────────────────────────────────────────────────────── */

interface IntegrityFlag { id: string; [k: string]: any; }

export function IntegrityView() {
  const [flags, setFlags] = useState<IntegrityFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<Record<string, any> | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchFlags = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/integrity/flags?status=all", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setFlags(json.flags || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchFlags(); }, [fetchFlags]);

  const runScan = useCallback(async () => {
    setScanLoading(true);
    try {
      const res = await fetch("/api/admin/integrity/scan", { method: "POST" });
      const data = await res.json();
      if (res.ok) { setScanResult(data); await fetchFlags(); }
    } finally { setScanLoading(false); }
  }, [fetchFlags]);

  const flagAction = useCallback(async (flagId: string, action: "dismiss" | "confirm" | "reopen") => {
    setActionLoading(`${flagId}_${action}`);
    try {
      await fetch("/api/admin/integrity/action", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagId, action }),
      });
      await fetchFlags();
    } finally { setActionLoading(null); }
  }, [fetchFlags]);

  return (
    <section className="space-y-4">
      <IntegrityPanel flags={flags as any} loading={loading} scanLoading={scanLoading} scanResult={scanResult}
        onScan={runScan} onAction={flagAction} actionLoading={actionLoading} formatDate={formatDate} />
    </section>
  );
}

/** ─── ACTIVITY LOGS ───────────────────────────────────────────────────── */

interface AdminLog {
  id: string; action: string; target_type: string; target_id: string;
  created_at: string; profiles: { username: string; display_name: string } | null;
}

export function LogsView() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/logs", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setLogs(json.logs || []);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-end">
        <button onClick={fetchLogs} className="text-xs text-ccb-muted hover:text-ccb-text flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      {loading ? (
        <div className="py-12 text-center"><Loader2 className="w-6 h-6 mx-auto text-ccb-muted animate-spin" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-12 text-ccb-muted text-sm"><ScrollText className="w-8 h-8 mx-auto mb-2 opacity-50" /> No admin actions logged</div>
      ) : (
        logs.map((log) => (
          <div key={log.id} className="card flex items-center justify-between text-sm">
            <div>
              <span className="font-medium">{log.action}</span>
              <span className="text-ccb-muted ml-2">by {log.profiles?.display_name || log.profiles?.username || "Admin"}</span>
            </div>
            <div className="text-xs text-ccb-muted">{log.target_type}:{log.target_id?.slice(0, 8)} · {formatDate(log.created_at)}</div>
          </div>
        ))
      )}
    </section>
  );
}

/** ─── WRAPPERS for self-contained legacy panels ────────────────────────── */

export function LeaguesView() {
  return <section className="space-y-4"><LeaguesAdminPanel /></section>;
}

export function JobsView() {
  return <section className="space-y-4"><JobsPanel /></section>;
}

export function SettingsView() {
  return (
    <section className="space-y-4">
      <PlatformSettingsHub />
      <CommunityRoomsCard />
    </section>
  );
}
