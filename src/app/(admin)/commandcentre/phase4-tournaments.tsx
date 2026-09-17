"use client";

/**
 * Command Centre Phase 4 — Tournament & Games management.
 *
 * Self-fetching views replacing the legacy /admin Tournaments and Games tabs:
 *  - TournamentsView: full lifecycle (approve/reject player submissions,
 *    start, advance round, cancel, force-finish, edit, delete, duplicate)
 *    plus a detail drawer with the live revenue breakdown — including the
 *    player-created 5% platform fee introduced 2026-09-17.
 *  - GamesView: chess + draughts game oversight with abort and result
 *    override (engine-aware since the legacy PATCH silently no-op'd on
 *    draughts).
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  RefreshCw, Trophy, Swords, Users, Calendar, Trash2, Copy, Play,
  Square, ChevronRight, X, Check, Ban, Pencil, Loader2, Crown, ShieldAlert,
} from "lucide-react";
import { timeAgo } from "./sections";

/* ───────────────────────────── helpers ───────────────────────────── */

const fmtMwk = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `MK ${(Math.round(v)).toLocaleString()}`;

const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};

const STATUS_STYLES: Record<string, string> = {
  upcoming: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  active: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  pending_approval: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  finished: "bg-violet-500/10 text-violet-400 border-violet-500/30",
  cancelled: "bg-red-500/10 text-red-400 border-red-500/30",
  rejected: "bg-red-500/10 text-red-400 border-red-500/30",
  completed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  draw: "bg-slate-500/10 text-slate-400 border-slate-500/30",
  abort: "bg-red-500/10 text-red-400 border-red-500/30",
  playing: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  waiting: "bg-amber-500/10 text-amber-400 border-amber-500/30",
};

const statusBadge = (status: string) => (
  <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${STATUS_STYLES[status] || "bg-ccb-surface text-ccb-muted border-ccb-border"}`}>
    {status.replace(/_/g, " ")}
  </span>
);

interface TournamentRow {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  time_control: string;
  entry_fee: number;
  prize_pool: number;
  pool_source: string | null;
  creator_profit_percent: number | null;
  is_player_created?: boolean | null;
  entry_fees_collected?: number | null;
  platform_fee_collected?: number | null;
  max_players: number | null;
  min_players: number | null;
  current_round: number;
  rounds: number | null;
  starts_at: string;
  created_at: string;
  participant_count: number;
  paid_count?: number;
  revenue?: number;
}

/* ═══════════════════════════ TournamentsView ═══════════════════════════ */

export function TournamentsView() {
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [playerOnly, setPlayerOnly] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const [detail, setDetail] = useState<{ id: string; data: any } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState<TournamentRow | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [editSaving, setEditSaving] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tournaments", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load tournaments");
      const data = await res.json();
      setTournaments(data.tournaments || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  const act = async (t: TournamentRow, action: string, opts?: { method?: string; body?: any }) => {
    const key = `${t.id}:${action}`;
    setBusy((b) => ({ ...b, [key]: true }));
    setConfirming(null);
    try {
      let res: Response;
      if (action === "delete") {
        res = await fetch(`/api/admin/tournaments?id=${t.id}`, { method: "DELETE" });
      } else if (action === "duplicate") {
        res = await fetch("/api/admin/tournaments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tournamentId: t.id }),
        });
      } else if (["start", "advance_round", "cancel", "force_finish"].includes(action)) {
        res = await fetch(`/api/admin/tournaments/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
      } else {
        res = await fetch("/api/admin/tournaments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tournamentId: t.id, action, ...(opts?.body || {}) }),
        });
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ ok: false, text: data.error || `Action "${action}" failed` });
      } else {
        setToast({ ok: true, text: `Tournament ${action.replace(/_/g, " ")} ✓` });
        fetchList();
        if (detail?.id === t.id) openDetail(t.id, true);
      }
    } catch (e: any) {
      setToast({ ok: false, text: e.message || "Action failed" });
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
      setTimeout(() => setToast(null), 6000);
    }
  };

  const openDetail = async (id: string, silent = false) => {
    setDetail({ id, data: null });
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${id}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load detail");
      setDetail({ id, data });
    } catch (e: any) {
      setDetail(null);
      if (!silent) setToast({ ok: false, text: e.message });
    } finally {
      setDetailLoading(false);
    }
  };

  const openEdit = (t: TournamentRow) => {
    setEditing(t);
    const dt = new Date(t.starts_at);
    dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
    setEditForm({
      name: t.name,
      description: t.description || "",
      starts_at: dt.toISOString().slice(0, 16),
      entry_fee: t.entry_fee,
      prize_pool: t.prize_pool,
      min_players: t.min_players || 2,
      max_players: t.max_players || 32,
      creator_profit_percent: t.creator_profit_percent || 0,
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setEditSaving(true);
    try {
      const res = await fetch("/api/admin/tournaments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: editing.id,
          action: "edit",
          name: editForm.name,
          description: editForm.description || null,
          starts_at: new Date(editForm.starts_at).toISOString(),
          entry_fee: Number(editForm.entry_fee) || 0,
          prize_pool: Number(editForm.prize_pool) || 0,
          min_players: Number(editForm.min_players) || 2,
          max_players: Number(editForm.max_players) || 32,
          creator_profit_percent: Number(editForm.creator_profit_percent) || 0,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ ok: false, text: data.error || "Edit failed" });
      } else {
        setToast({ ok: true, text: "Tournament updated ✓" });
        setEditing(null);
        fetchList();
      }
    } catch (e: any) {
      setToast({ ok: false, text: e.message });
    } finally {
      setEditSaving(false);
    }
  };

  const filtered = useMemo(() => tournaments.filter((t) => {
    if (playerOnly && !t.is_player_created) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [tournaments, playerOnly, statusFilter, search]);

  const pendingCount = tournaments.filter((t) => t.status === "pending_approval").length;
  const activeCount = tournaments.filter((t) => t.status === "active").length;
  const playerCount = tournaments.filter((t) => t.is_player_created).length;

  const btn = "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors";
  const btnGhost = `${btn} border-ccb-border bg-ccb-surface text-ccb-muted hover:border-violet-500/50 hover:text-white`;
  const btnDanger = `${btn} border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20`;
  const btnOk = `${btn} border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20`;
  const btnPrimary = `${btn} border-violet-500/30 bg-violet-600/20 text-violet-300 hover:bg-violet-600/30`;

  return (
    <div className="space-y-5 text-[13px]">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">Tournaments</h2>
          <p className="text-xs text-ccb-muted">Full lifecycle control — platform-hosted and player-created events</p>
        </div>
        <button onClick={fetchList} className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-ccb-muted transition hover:border-violet-500 hover:text-white">
          <RefreshCw className="mr-1 inline h-3 w-3" /> Refresh
        </button>
      </div>

      {toast && (
        <div className={`rounded-lg px-3 py-2 text-xs font-medium ${toast.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
          {toast.text}
          <button onClick={() => setToast(null)} className="ml-2 text-ccb-muted underline hover:text-white">Dismiss</button>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ["Pending approval", pendingCount, pendingCount > 0 ? "text-amber-400" : "text-white"],
          ["Active", activeCount, "text-white"],
          ["Player-created", playerCount, "text-white"],
          ["Total shown", tournaments.length, "text-white"],
        ].map(([label, val, cls]) => (
          <div key={label as string} className="rounded-xl border border-ccb-border bg-ccb-card p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-ccb-muted">{label as string}</p>
            <p className={`mt-1 text-xl font-bold ${cls as string}`}>{val as number}</p>
          </div>
        ))}
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        {["all", "pending_approval", "upcoming", "active", "finished", "cancelled", "rejected"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-medium capitalize transition ${
              statusFilter === s ? "bg-violet-600/20 text-violet-300 border border-violet-500/40" : "border border-ccb-border bg-ccb-surface text-ccb-muted hover:text-white"
            }`}
          >
            {s.replace(/_/g, " ")}
          </button>
        ))}
        <label className="ml-1 inline-flex cursor-pointer select-none items-center gap-1.5 text-[11px] text-ccb-muted">
          <input type="checkbox" checked={playerOnly} onChange={(e) => setPlayerOnly(e.target.checked)} className="accent-violet-500" />
          Player-created only
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name…"
          className="ml-auto w-40 rounded-lg border border-ccb-border bg-ccb-surface px-2.5 py-1 text-[11px] text-white placeholder:text-ccb-muted/60 focus:border-violet-500/60 focus:outline-none"
        />
      </div>

      {/* list */}
      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-ccb-border bg-ccb-card" />)}</div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-ccb-border bg-ccb-card p-8 text-center text-ccb-muted">No tournaments match this filter.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((t) => (
            <div key={t.id} className="rounded-xl border border-ccb-border bg-ccb-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="truncate font-semibold text-white">{t.name}</span>
                    {statusBadge(t.status)}
                    {t.pool_source === "fixed" && (
                      <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-400">Fixed</span>
                    )}
                    {t.is_player_created && (
                      <span className="rounded border border-violet-500/30 bg-violet-600/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-300">Player{t.pool_source === "fixed" ? " · escrow" : ""}</span>
                    )}
                    <span className="text-[10px] uppercase text-ccb-muted">{t.type}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ccb-muted">
                    <span className="inline items-center gap-1"><Users className="inline h-3 w-3" /> {t.participant_count}/{t.max_players ?? "∞"}{t.paid_count ? ` (${t.paid_count} paid)` : ""}</span>
                    <span><Trophy className="inline h-3 w-3" /> {fmtMwk(t.prize_pool)}</span>
                    <span>Entry {fmtMwk(t.entry_fee)}</span>
                    {t.is_player_created && !!t.platform_fee_collected && <span className="text-emerald-400">Platform fee {fmtMwk(t.platform_fee_collected)}</span>}
                    <span><Calendar className="inline h-3 w-3" /> {fmtDateTime(t.starts_at)}</span>
                    {t.status === "active" && <span>Round {t.current_round}{t.rounds ? `/${t.rounds}` : ""}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button onClick={() => openDetail(t.id)} className={btnGhost}><ChevronRight className="h-3 w-3" /> Detail</button>
                  {t.status === "pending_approval" && (
                    <>
                      <button disabled={busy[`${t.id}:approve`]} onClick={() => act(t, "approve")} className={btnOk}>
                        {busy[`${t.id}:approve`] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Approve
                      </button>
                      <button disabled={busy[`${t.id}:reject`]} onClick={() => (confirming === `reject:${t.id}` ? act(t, "reject") : setConfirming(`reject:${t.id}`))} className={btnDanger}>
                        <Ban className="h-3 w-3" /> {confirming === `reject:${t.id}` ? "Confirm reject?" : "Reject"}
                      </button>
                    </>
                  )}
                  {t.status === "upcoming" && (
                    <button disabled={busy[`${t.id}:start`]} onClick={() => act(t, "start")} className={btnPrimary}>
                      {busy[`${t.id}:start`] ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />} Start
                    </button>
                  )}
                  {t.status === "active" && (
                    <button disabled={busy[`${t.id}:advance_round`]} onClick={() => act(t, "advance_round")} className={btnGhost}>
                      <ChevronRight className="h-3 w-3" /> Next round
                    </button>
                  )}
                  {["upcoming", "active"].includes(t.status) && (
                    <button onClick={() => openEdit(t)} className={btnGhost}><Pencil className="h-3 w-3" /> Edit</button>
                  )}
                  {["upcoming", "active"].includes(t.status) && (
                    <button disabled={busy[`${t.id}:cancel`]} onClick={() => (confirming === `cancel:${t.id}` ? act(t, "cancel") : setConfirming(`cancel:${t.id}`))} className={btnDanger}>
                      <Square className="h-3 w-3" /> {confirming === `cancel:${t.id}` ? "Confirm cancel?" : "Cancel"}
                    </button>
                  )}
                  {t.status === "active" && (
                    <button disabled={busy[`${t.id}:force_finish`]} onClick={() => (confirming === `force_finish:${t.id}` ? act(t, "force_finish") : setConfirming(`force_finish:${t.id}`))} className={btnDanger}>
                      <Square className="h-3 w-3" /> {confirming === `force_finish:${t.id}` ? "Confirm finish?" : "Force finish"}
                    </button>
                  )}
                  <button disabled={busy[`${t.id}:duplicate`]} onClick={() => act(t, "duplicate")} className={btnGhost}>
                    <Copy className="h-3 w-3" /> Duplicate
                  </button>
                  <button disabled={busy[`${t.id}:delete`]} onClick={() => (confirming === `delete:${t.id}` ? act(t, "delete") : setConfirming(`delete:${t.id}`))} className={btnDanger}>
                    <Trash2 className="h-3 w-3" /> {confirming === `delete:${t.id}` ? "Confirm delete?" : "Delete"}
                  </button>
                </div>
              </div>
              {confirming && confirming.endsWith(`:${t.id}`) && (
                <p className="mt-2 flex items-center gap-1 text-[10px] text-amber-400">
                  <ShieldAlert className="h-3 w-3" /> Click again to confirm. {confirming.startsWith("cancel") && "Participants will be refunded."} {confirming.startsWith("delete") && t.is_player_created && "Escrow settles back to the creator first."}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── detail drawer ── */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setDetail(null)}>
          <div
            className="h-full w-full max-w-lg overflow-y-auto border-l border-ccb-border bg-ccb-surface p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-white">Tournament detail</h3>
              <button onClick={() => setDetail(null)} className="text-ccb-muted hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            {detailLoading || !detail.data ? (
              <div className="space-y-3">{[1, 2, 3, 4].map((i) => <div key={i} className="h-16 animate-pulse rounded-lg bg-ccb-card" />)}</div>
            ) : (
              <div className="space-y-5 text-xs">
                <div>
                  <p className="text-base font-bold text-white">{detail.data.tournament.name}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {statusBadge(detail.data.tournament.status)}
                    <span className="rounded border border-ccb-border px-1.5 py-0.5 text-[9px] uppercase text-ccb-muted">{detail.data.tournament.type}</span>
                    {detail.data.tournament.is_player_created && <span className="rounded border border-violet-500/30 bg-violet-600/10 px-1.5 py-0.5 text-[9px] font-bold uppercase text-violet-300">Player-created</span>}
                    {detail.data.tournament.creator && <span className="text-ccb-muted">Creator: {detail.data.tournament.creator.username}</span>}
                  </div>
                  {detail.data.tournament.description && <p className="mt-2 text-ccb-muted">{detail.data.tournament.description}</p>}
                </div>

                {/* revenue */}
                <div className="rounded-lg border border-ccb-border bg-ccb-card p-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ccb-muted">Economics</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                    {[
                      ["Entry fee", fmtMwk(detail.data.revenue.entryFee)],
                      ["Paid participants", String(detail.data.revenue.paidParticipants)],
                      ["Gross collected", fmtMwk(detail.data.revenue.totalCollected)],
                      ["Prize pool (nominal)", fmtMwk(detail.data.revenue.prizePool)],
                      ["Actual prize to winners", fmtMwk(detail.data.revenue.actualPrizePool)],
                      ["Platform revenue", fmtMwk(detail.data.revenue.platformRevenue)],
                      ["Creator profit", detail.data.revenue.creatorProfit > 0 ? fmtMwk(detail.data.revenue.creatorProfit) : "—"],
                      ["Pool mode", detail.data.revenue.poolSource === "fixed" ? "Fixed" : "Entry fees"],
                    ].map(([k, v]) => (
                      <div key={k} className="flex items-center justify-between gap-2">
                        <span className="text-ccb-muted">{k}</span>
                        <span className="font-semibold text-white">{v}</span>
                      </div>
                    ))}
                  </div>
                  {detail.data.tournament.is_player_created && (
                    <p className="mt-2 border-t border-ccb-border pt-2 text-[10px] text-ccb-muted">
                      Player-led event — platform keeps 5% of gross entry fees. Prize escrow is never raked.
                    </p>
                  )}
                </div>

                {/* participants */}
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ccb-muted">Participants ({detail.data.participants.length})</p>
                  <div className="max-h-64 space-y-1 overflow-y-auto">
                    {detail.data.participants.map((p: any) => (
                      <div key={p.id} className="flex items-center justify-between rounded-lg border border-ccb-border bg-ccb-card px-3 py-1.5">
                        <span className="truncate text-white">{p.profile?.username || p.player_id.slice(0, 8)}</span>
                        <span className="text-ccb-muted">score {p.score ?? 0} · {p.games_played ?? 0} games {p.paid_entry_fee ? "· paid" : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* rounds */}
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ccb-muted">Rounds</p>
                  <div className="max-h-48 space-y-1 overflow-y-auto">
                    {detail.data.rounds.map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between rounded-lg border border-ccb-border bg-ccb-card px-3 py-1.5">
                        <span className="text-white">Round {r.round_number}</span>
                        <span className="text-ccb-muted">{r.is_complete ? "Complete" : "In progress"} · {timeAgo(r.starts_at)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── edit modal ── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-xl border border-ccb-border bg-ccb-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-white">Edit tournament</h3>
              <button onClick={() => setEditing(null)} className="text-ccb-muted hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 text-xs">
              {([
                ["name", "Name", "text"],
                ["starts_at", "Starts at", "datetime-local"],
                ["entry_fee", "Entry fee (MWK)", "number"],
                ["prize_pool", "Prize pool (MWK, fixed pools)", "number"],
                ["min_players", "Min players", "number"],
                ["max_players", "Max players", "number"],
                ["creator_profit_percent", "Creator cut % (entry-fee pools)", "number"],
              ] as const).map(([field, label, type]) => (
                <div key={field}>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ccb-muted">{label}</label>
                  <input
                    type={type}
                    value={editForm[field] ?? ""}
                    onChange={(e) => setEditForm((f) => ({ ...f, [field]: e.target.value }))}
                    className="w-full rounded-lg border border-ccb-border bg-ccb-card px-2.5 py-1.5 text-white focus:border-violet-500/60 focus:outline-none"
                  />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ccb-muted">Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                  className="min-h-[60px] w-full rounded-lg border border-ccb-border bg-ccb-card px-2.5 py-1.5 text-white focus:border-violet-500/60 focus:outline-none"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border border-ccb-border px-3 py-1.5 text-xs text-ccb-muted hover:text-white">Cancel</button>
              <button onClick={saveEdit} disabled={editSaving} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500">
                {editSaving && <Loader2 className="h-3 w-3 animate-spin" />} Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════ GamesView ═══════════════════════════ */

interface GameRow {
  id: string;
  status: string;
  time_control: string;
  rated: boolean | null;
  white_player_id: string | null;
  black_player_id: string | null;
  white_rating: number | null;
  black_rating: number | null;
  winner: string | null;
  created_at: string;
  ended_at: string | null;
  move_count: number | null;
  tournament_id?: string | null;
  white_username?: string | null;
  black_username?: string | null;
}

export function GamesView() {
  const [games, setGames] = useState<GameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<"chess" | "draughts">("chess");
  const [statusFilter, setStatusFilter] = useState("all");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [override, setOverride] = useState<{ game: GameRow; winner: string; note: string } | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const fetchGames = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/games?status=${statusFilter}&engine=${engine}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to load games");
      const data = await res.json();
      setGames(data.games || []);
    } catch (e: any) {
      setError(e.message);
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, engine]);

  useEffect(() => { fetchGames(); }, [fetchGames]);

  const patchGame = async (g: GameRow, action: string, body: Record<string, any>) => {
    setBusy((b) => ({ ...b, [g.id]: true }));
    setConfirming(null);
    try {
      const res = await fetch("/api/admin/games", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: g.id, action, engine, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      setToast(res.ok ? { ok: true, text: `Game ${action === "abort" ? "aborted" : "result set"} ✓` } : { ok: false, text: data.error || "Action failed" });
      if (res.ok) fetchGames();
    } catch (e: any) {
      setToast({ ok: false, text: e.message });
    } finally {
      setBusy((b) => ({ ...b, [g.id]: false }));
      setTimeout(() => setToast(null), 6000);
    }
  };

  const nameOf = (g: GameRow, side: "white" | "black") => {
    const uname = side === "white" ? g.white_username : g.black_username;
    const id = side === "white" ? g.white_player_id : g.black_player_id;
    return uname || (id ? id.slice(0, 8) : "—");
  };
  const winnerLabel = (g: GameRow) => {
    if (g.status === "abort") return "Aborted";
    if (g.status === "draw" || g.winner === null) return "Draw";
    return g.winner === "white" ? nameOf(g, "white") : nameOf(g, "black");
  };

  const isLive = (g: GameRow) => ["playing", "waiting", "active"].includes(g.status);

  return (
    <div className="space-y-5 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">Games</h2>
          <p className="text-xs text-ccb-muted">Chess & draughts oversight — abort, result override, integrity checks</p>
        </div>
        <button onClick={fetchGames} className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-ccb-muted transition hover:border-violet-500 hover:text-white">
          <RefreshCw className="mr-1 inline h-3 w-3" /> Refresh
        </button>
      </div>

      {toast && (
        <div className={`rounded-lg px-3 py-2 text-xs font-medium ${toast.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
          {toast.text}
          <button onClick={() => setToast(null)} className="ml-2 text-ccb-muted underline hover:text-white">Dismiss</button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-ccb-border bg-ccb-surface p-0.5">
          {(["chess", "draughts"] as const).map((en) => (
            <button
              key={en}
              onClick={() => { setEngine(en); }}
              className={`rounded-md px-3 py-1 text-[11px] font-semibold capitalize transition ${engine === en ? "bg-violet-600/20 text-violet-300" : "text-ccb-muted hover:text-white"}`}
            >
              {en === "chess" ? <Swords className="mr-1 inline h-3 w-3" /> : <Crown className="mr-1 inline h-3 w-3" />}
              {en}
            </button>
          ))}
        </div>
        {["all", "playing", "waiting", "completed", "draw", "abort"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-medium capitalize transition ${
              statusFilter === s ? "bg-violet-600/20 border border-violet-500/40 text-violet-300" : "border border-ccb-border bg-ccb-surface text-ccb-muted hover:text-white"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg border border-ccb-border bg-ccb-card" />)}</div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">{error}</div>
      ) : games.length === 0 ? (
        <div className="rounded-xl border border-ccb-border bg-ccb-card p-8 text-center text-ccb-muted">No games match this filter.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ccb-border">
          <div className="hidden grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-3 border-b border-ccb-border bg-ccb-card px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-ccb-muted md:grid">
            <span>White</span><span>Black</span><span>Status</span><span>Created</span><span className="text-right">Actions</span>
          </div>
          {games.map((g) => (
            <div key={g.id} className="grid grid-cols-1 items-center gap-2 border-b border-ccb-border/60 px-4 py-2.5 last:border-b-0 odd:bg-ccb-card/40 md:grid-cols-[1fr_1fr_auto_auto_auto] md:gap-3">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="h-2.5 w-2.5 rounded-full border border-ccb-muted/60 bg-white" />
                <span className="truncate text-white">{nameOf(g, "white")}</span>
                <span className="text-ccb-muted">{g.white_rating ?? ""}</span>
                {g.winner === "white" && <Crown className="h-3 w-3 text-amber-400" />}
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="h-2.5 w-2.5 rounded-full border border-ccb-muted bg-black" />
                <span className="truncate text-white">{nameOf(g, "black")}</span>
                <span className="text-ccb-muted">{g.black_rating ?? ""}</span>
                {g.winner === "black" && <Crown className="h-3 w-3 text-amber-400" />}
              </div>
              <div className="flex items-center gap-1.5">
                {statusBadge(g.status)}
                {!g.tournament_id && g.tournament_id !== undefined && <span className="text-[9px] uppercase text-ccb-muted">Casual</span>}
                {g.tournament_id && <span className="text-[9px] uppercase text-violet-300">Tournament</span>}
              </div>
              <span className="text-[11px] text-ccb-muted">{timeAgo(g.created_at)}</span>
              <div className="flex items-center justify-end gap-1.5">
                {isLive(g) && !g.tournament_id && (
                  <button
                    disabled={busy[g.id]}
                    onClick={() => (confirming === `abort:${g.id}` ? patchGame(g, "abort", {}) : setConfirming(`abort:${g.id}`))}
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/20"
                  >
                    {confirming === `abort:${g.id}` ? "Confirm?" : "Abort"}
                  </button>
                )}
                {!isLive(g) && g.status !== "abort" && (
                  <button
                    disabled={busy[g.id]}
                    onClick={() => setOverride({ game: g, winner: "white", note: "" })}
                    className="rounded-lg border border-ccb-border bg-ccb-surface px-2 py-1 text-[10px] font-medium text-ccb-muted hover:border-violet-500/50 hover:text-white"
                  >
                    Override result
                  </button>
                )}
                <span className="hidden text-[11px] text-ccb-muted lg:inline">{g.move_count ?? 0} moves · {winnerLabel(g)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* override modal */}
      {override && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOverride(null)}>
          <div className="w-full max-w-sm rounded-xl border border-ccb-border bg-ccb-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-white">Result override</h3>
              <button onClick={() => setOverride(null)} className="text-ccb-muted hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-3 text-[11px] text-ccb-muted">
              {nameOf(override.game, "white")} vs {nameOf(override.game, "black")}
              {override.game.tournament_id ? " — tournament game (recorded immediately if unrecorded)" : ""}
            </p>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {(["white", "draw", "black"] as const).map((w) => (
                <button
                  key={w}
                  onClick={() => setOverride((o) => (o ? { ...o, winner: w } : o))}
                  className={`truncate rounded-lg border px-2 py-2 text-[11px] font-semibold capitalize ${
                    override.winner === w ? "border-violet-500/50 bg-violet-600/20 text-white" : "border-ccb-border bg-ccb-card text-ccb-muted"
                  }`}
                >
                  {w === "white" ? nameOf(override.game, "white") : w === "black" ? nameOf(override.game, "black") : "Draw"}
                </button>
              ))}
            </div>
            <input
              value={override.note}
              onChange={(e) => setOverride((o) => (o ? { ...o, note: e.target.value } : o))}
              placeholder="Reason / note (optional)"
              className="mb-4 w-full rounded-lg border border-ccb-border bg-ccb-card px-2.5 py-1.5 text-xs text-white placeholder:text-ccb-muted/60 focus:border-violet-500/60 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setOverride(null)} className="rounded-lg border border-ccb-border px-3 py-1.5 text-xs text-ccb-muted hover:text-white">Cancel</button>
              <button
                onClick={() => { patchGame(override.game, "set_result", { winner: override.winner, note: override.note }); setOverride(null); }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
              >
                <Check className="h-3 w-3" /> Apply override
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
