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
  Square, ChevronRight, X, Check, Ban, Pencil, Loader2, Crown, ShieldAlert, MoreHorizontal,
} from "lucide-react";
import { timeAgo } from "./sections";

/* ───────────────────────────── helpers ───────────────────────────── */

const fmtMwk = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `MK ${(Math.round(v)).toLocaleString()}`;

const fmtUsd = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : `$${(Math.round(v * 100) / 100).toLocaleString()}`;

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
  const [moreOpen, setMoreOpen] = useState<string | null>(null);
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
      <div className="flex flex-wrap items-center justify-end gap-2">
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
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-semibold text-white break-words">{t.name}</span>
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
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-ccb-border pt-3">
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
                  <button onClick={() => setMoreOpen(moreOpen === t.id ? null : t.id)} className={`${btnGhost} md:hidden`}>
                    <MoreHorizontal className="h-3 w-3" /> {moreOpen === t.id ? "Less" : "More"}
                  </button>
                  <div className={`${moreOpen === t.id ? "flex" : "hidden"} w-full flex-wrap items-center gap-1.5 md:flex`}>
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
  // Game detail drawer (View action) — fetches the full drilldown
  const [detail, setDetail] = useState<{
    game: GameRow;
    loading: boolean;
    error: string | null;
    data: {
      players?: any;
      game?: any;
      battle?: any;
      moves?: string[];
    } | null;
  } | null>(null);

  const openDetail = async (g: GameRow) => {
    setDetail({ game: g, loading: true, error: null, data: null });
    try {
      const res = await fetch(`/api/admin/games/${g.id}?engine=${engine}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load game detail");
      setDetail({ game: g, loading: false, error: null, data });
    } catch (e: any) {
      setDetail({ game: g, loading: false, error: e.message, data: null });
    }
  };

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
      <div className="flex flex-wrap items-center justify-end gap-2">
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
            <div key={g.id} className="border-b border-ccb-border/60 px-3 py-2.5 last:border-b-0 odd:bg-ccb-card/40 md:grid md:grid-cols-[1fr_1fr_auto_auto_auto] md:items-center md:gap-3 md:px-4 md:py-2">
              <div className="flex min-w-0 items-center gap-1.5 md:contents">
                <div className="flex min-w-0 items-center gap-1.5 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-ccb-muted/60 bg-white" />
                  <span className="truncate text-white">{nameOf(g, "white")}</span>
                  <span className="shrink-0 text-ccb-muted">{g.white_rating ?? ""}</span>
                  {g.winner === "white" && <Crown className="h-3 w-3 shrink-0 text-amber-400" />}
                </div>
                <span className="shrink-0 text-[10px] italic text-ccb-muted md:hidden">vs</span>
                <div className="flex min-w-0 items-center gap-1.5 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-ccb-muted bg-black" />
                  <span className="truncate text-white">{nameOf(g, "black")}</span>
                  <span className="shrink-0 text-ccb-muted">{g.black_rating ?? ""}</span>
                  {g.winner === "black" && <Crown className="h-3 w-3 shrink-0 text-amber-400" />}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 md:mt-0 md:contents">
              <div className="flex items-center gap-1.5">
                {statusBadge(g.status)}
                {!g.tournament_id && g.tournament_id !== undefined && <span className="text-[9px] uppercase text-ccb-muted">Casual</span>}
                {g.tournament_id && <span className="text-[9px] uppercase text-violet-300">Tournament</span>}
              </div>
              <span className="text-[11px] text-ccb-muted">{timeAgo(g.created_at)}</span>
              <div className="flex items-center justify-end gap-1.5">
                <button
                  onClick={() => openDetail(g)}
                  className="rounded-lg border border-ccb-border bg-ccb-surface px-2 py-1 text-[10px] font-medium text-ccb-muted hover:border-violet-500/50 hover:text-white"
                >
                  View
                </button>
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
            </div>
          ))}
        </div>
      )}

      {/* game detail drawer (View) */}
      {detail && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setDetail(null)} />
          <div className="fixed inset-y-0 right-0 z-50 flex w-[520px] max-w-full flex-col border-l border-ccb-border bg-ccb-card shadow-2xl">
            <div className="flex items-start justify-between border-b border-ccb-border p-5">
              <div>
                <h3 className="text-sm font-semibold text-white">
                  {nameOf(detail.game, "white")} <span className="text-ccb-muted">vs</span> {nameOf(detail.game, "black")}
                </h3>
                <p className="text-[11px] text-ccb-muted">
                  {engine === "chess" ? "Chess" : "Draughts"} · {detail.game.time_control} ·{" "}
                  {detail.game.rated ? "Rated" : "Casual"} · {statusBadge(detail.game.status)}
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="rounded p-1 text-ccb-muted hover:bg-ccb-surface hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-5 text-[12px]">
              {detail.loading ? (
                <div className="flex items-center justify-center gap-2 py-12 text-ccb-muted">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading game…
                </div>
              ) : detail.error ? (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-red-400">{detail.error}</div>
              ) : (
                <>
                  {detail.data?.battle && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-amber-400">Wagered battle</p>
                      <p className="text-white">
                        Stake {fmtUsd(detail.data.battle.stakeUsd)} · Pot {fmtUsd(detail.data.battle.potUsd)} · Rake {fmtUsd(detail.data.battle.platformFeeUsd)}
                        {detail.data.battle.settled ? " · settled" : detail.data.battle.status ? ` · ${detail.data.battle.status}` : ""}
                      </p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["White", nameOf(detail.game, "white"), detail.game.white_rating],
                      ["Black", nameOf(detail.game, "black"), detail.game.black_rating],
                    ].map(([side, name, rating]) => (
                      <div key={side as string} className="rounded-lg border border-ccb-border bg-ccb-surface p-2.5">
                        <span className="text-[10px] uppercase tracking-wider text-ccb-muted">{side}</span>
                        <p className="truncate font-semibold text-white">{name}</p>
                        <p className="text-ccb-muted">{rating ?? "—"} elo</p>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-ccb-border bg-ccb-surface p-2.5 text-[11px]">
                    <div><span className="text-ccb-muted">Result: </span><span className="text-white">{winnerLabel(detail.game)}</span></div>
                    <div><span className="text-ccb-muted">Moves: </span><span className="text-white">{detail.game.move_count ?? detail.data?.moves?.length ?? 0}</span></div>
                    <div><span className="text-ccb-muted">Created: </span><span className="text-white">{fmtDateTime(detail.game.created_at)}</span></div>
                    <div><span className="text-ccb-muted">Ended: </span><span className="text-white">{detail.game.ended_at ? fmtDateTime(detail.game.ended_at) : "—"}</span></div>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-ccb-muted">Move history</p>
                    {detail.data?.moves && detail.data.moves.length > 0 ? (
                      <div className="max-h-72 overflow-y-auto rounded-lg border border-ccb-border bg-ccb-surface p-2.5 font-mono text-[11px] leading-relaxed">
                        {detail.data.moves.map((mv, i) => (
                          <span key={i}>
                            {i % 2 === 0 && <span className="text-ccb-muted">{Math.floor(i / 2) + 1}. </span>}
                            <span className="text-white">{mv} </span>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-ccb-muted">No moves recorded.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
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

/* ═══════════════════════════ BattlesView ═══════════════════════════ */

interface BattlePlayer {
  id: string;
  username: string | null;
  display_name: string | null;
  country: string | null;
}

interface BattleRow {
  id: string;
  status: string;
  stake: number;
  pot: number;
  platform_fee: number | null;
  winner_payout: number | null;
  result: string | null;
  white_player_id: string;
  black_player_id: string;
  winner_id: string | null;
  white_rating: number | null;
  black_rating: number | null;
  game_id: string | null;
  armageddon_game_id: string | null;
  armageddon_round: number | null;
  settled: boolean;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  time_control: string | null;
  notes: string | null;
  white_player: BattlePlayer | null;
  black_player: BattlePlayer | null;
  winner: BattlePlayer | null;
  stuck: boolean;
  pending_age_seconds: number | null;
  stakeUsd: number;
  potUsd: number;
  platformFeeUsd: number;
  winnerPayoutUsd: number;
}

const BATTLE_STATUSES = ["all", "stuck", "pending", "playing", "completed", "disputed", "cancelled"] as const;
const BATTLE_RANGES = ["today", "7d", "30d", "3m", "all"] as const;

export function BattlesView() {
  const [battles, setBattles] = useState<BattleRow[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [range, setRange] = useState<string>("7d");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [confirming, setConfirming] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  // View drawer / set-result modal
  const [viewing, setViewing] = useState<BattleRow | null>(null);
  const [settling, setSettling] = useState<BattleRow | null>(null);
  const [settleWinner, setSettleWinner] = useState<string>("");

  const fetchBattles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ status: statusFilter, range, page: String(page), limit: "50" });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/admin/battles?${params}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load battles");
      setBattles(data.battles || []);
      setStats(data.stats || null);
      setTotal(data.total || 0);
    } catch (e: any) {
      setError(e.message);
      setBattles([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, range, search, page]);

  useEffect(() => { fetchBattles(); }, [fetchBattles]);

  const runAction = async (b: BattleRow, action: string, body: Record<string, any> = {}) => {
    setBusy((s) => ({ ...s, [b.id]: true }));
    setConfirming(null);
    try {
      const res = await fetch(`/api/admin/battles/${b.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      const labels: Record<string, string> = {
        cancel_refund: "aborted — stakes refunded",
        retry_game: "restarted — new game created",
        force_settle: "settled",
      };
      setToast(res.ok
        ? { ok: true, text: `Battle ${labels[action] || action} ✓` }
        : { ok: false, text: data.error || "Action failed" });
      if (res.ok) fetchBattles();
    } catch (e: any) {
      setToast({ ok: false, text: e.message });
    } finally {
      setBusy((s) => ({ ...s, [b.id]: false }));
      setTimeout(() => setToast(null), 6000);
    }
  };

  const nameOf = (bp: BattlePlayer | null, fallbackId: string) => bp?.username || (fallbackId ? fallbackId.slice(0, 8) : "—");

  const statTiles = stats ? [
    { label: "Battles", value: stats.total },
    { label: "Pending", value: stats.pending, warn: stats.pending > 0 },
    { label: "Stuck", value: stats.stuck, warn: stats.stuck > 0 },
    { label: "Disputed", value: stats.disputed, warn: stats.disputed > 0 },
    { label: "Volume", value: fmtUsd(stats.totalVolumeUsd) },
    { label: "Rake", value: fmtUsd(stats.totalRevenueUsd) },
  ] : [];

  return (
    <div className="space-y-5 text-[13px]">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button onClick={fetchBattles} className="rounded-lg border border-ccb-border bg-ccb-surface px-3 py-1.5 text-xs text-ccb-muted transition hover:border-violet-500 hover:text-white">
          <RefreshCw className="mr-1 inline h-3 w-3" /> Refresh
        </button>
      </div>

      {toast && (
        <div className={`rounded-lg px-3 py-2 text-xs font-medium ${toast.ok ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
          {toast.text}
          <button onClick={() => setToast(null)} className="ml-2 text-ccb-muted underline hover:text-white">Dismiss</button>
        </div>
      )}

      {/* stat tiles */}
      {statTiles.length > 0 && (
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {statTiles.map((t) => (
            <div key={t.label} className={`rounded-xl border p-2.5 ${t.warn ? "border-amber-500/30 bg-amber-500/5" : "border-ccb-border bg-ccb-card"}`}>
              <span className="block text-[10px] uppercase tracking-wider text-ccb-muted">{t.label}</span>
              <span className={`font-bold ${t.warn ? "text-amber-400" : "text-white"}`}>{t.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* filters */}
      <div className="flex flex-wrap items-center gap-2">
        {BATTLE_STATUSES.map((st) => (
          <button
            key={st}
            onClick={() => { setPage(1); setStatusFilter(st); }}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-medium capitalize transition ${
              statusFilter === st ? "bg-violet-600/20 border border-violet-500/40 text-violet-300" : "border border-ccb-border bg-ccb-surface text-ccb-muted hover:text-white"
            }`}
          >
            {st}
          </button>
        ))}
        <select
          value={range}
          onChange={(e) => { setPage(1); setRange(e.target.value); }}
          className="rounded-lg border border-ccb-border bg-ccb-surface px-2 py-1 text-[11px] text-ccb-muted"
        >
          {BATTLE_RANGES.map((r) => (
            <option key={r} value={r}>{r === "7d" ? "Last 7 days" : r === "3m" ? "Last 3 months" : r === "all" ? "All time" : r === "today" ? "Today" : "Last 30 days"}</option>
          ))}
        </select>
        <form
          onSubmit={(e) => { e.preventDefault(); setPage(1); fetchBattles(); }}
          className="ml-auto flex gap-1.5"
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search player…"
            className="w-44 rounded-lg border border-ccb-border bg-ccb-surface px-2.5 py-1 text-[11px] text-white placeholder:text-ccb-muted focus:border-violet-500 focus:outline-none"
          />
          <button type="submit" className="rounded-lg border border-ccb-border bg-ccb-surface px-2.5 py-1 text-[11px] text-ccb-muted hover:text-white">Search</button>
        </form>
      </div>

      {/* list */}
      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-12 animate-pulse rounded-lg border border-ccb-border bg-ccb-card" />)}</div>
      ) : error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-400">{error}</div>
      ) : battles.length === 0 ? (
        <div className="rounded-xl border border-ccb-border bg-ccb-card p-8 text-center text-ccb-muted">No battles match this filter.</div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ccb-border">
          <div className="hidden grid-cols-[1fr_1fr_auto_auto_auto_auto] items-center gap-3 border-b border-ccb-border bg-ccb-card px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-ccb-muted md:grid">
            <span>White</span><span>Black</span><span>Stake</span><span>Status</span><span>Created</span><span className="text-right">Actions</span>
          </div>
          {battles.map((b) => (
            <div key={b.id} className={`border-b border-ccb-border/60 px-3 py-2.5 last:border-b-0 odd:bg-ccb-card/40 md:grid md:grid-cols-[1fr_1fr_auto_auto_auto_auto] md:items-center md:gap-3 md:px-4 md:py-2 ${b.stuck ? "ring-1 ring-amber-500/40" : ""}`}>
              <div className="flex min-w-0 items-center gap-1.5 md:contents">
                <div className="flex min-w-0 items-center gap-1.5 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-ccb-muted/60 bg-white" />
                  <span className="truncate text-white">{nameOf(b.white_player, b.white_player_id)}</span>
                  {b.winner_id === b.white_player_id && <Crown className="h-3 w-3 shrink-0 text-amber-400" />}
                </div>
                <span className="shrink-0 text-[10px] italic text-ccb-muted md:hidden">vs</span>
                <div className="flex min-w-0 items-center gap-1.5 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-ccb-muted bg-black" />
                  <span className="truncate text-white">{nameOf(b.black_player, b.black_player_id)}</span>
                  {b.winner_id === b.black_player_id && <Crown className="h-3 w-3 shrink-0 text-amber-400" />}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 md:mt-0 md:contents">
                <span className="font-mono text-[11px] text-white">{fmtUsd(b.stakeUsd)}</span>
                <div className="flex items-center gap-1.5">
                  {statusBadge(b.stuck ? "stuck" : b.status)}
                  {b.settled && <span className="text-[9px] uppercase text-ccb-muted">Settled</span>}
                </div>
                <span className="text-[11px] text-ccb-muted">{timeAgo(b.created_at)}</span>
                <div className="flex items-center gap-1.5 md:justify-end md:ml-auto">
                <button onClick={() => setViewing(b)} className="rounded-lg border border-ccb-border bg-ccb-surface px-2 py-1 text-[10px] font-medium text-ccb-muted hover:border-violet-500/50 hover:text-white">View</button>
                {!b.settled && b.status !== "cancelled" && (
                  <button
                    disabled={busy[b.id]}
                    onClick={() => { setSettling(b); setSettleWinner(b.white_player_id); }}
                    className="rounded-lg border border-ccb-border bg-ccb-surface px-2 py-1 text-[10px] font-medium text-ccb-muted hover:border-violet-500/50 hover:text-white"
                  >
                    Set result
                  </button>
                )}
                {b.status === "pending" && !b.game_id && (
                  <button
                    disabled={busy[b.id]}
                    onClick={() => (confirming === `cancel:${b.id}` ? runAction(b, "cancel_refund") : setConfirming(`cancel:${b.id}`))}
                    className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-400 hover:bg-red-500/20"
                  >
                    {confirming === `cancel:${b.id}` ? "Confirm?" : "Abort & refund"}
                  </button>
                )}
                {b.stuck && !b.game_id && (
                  <button
                    disabled={busy[b.id]}
                    onClick={() => (confirming === `retry:${b.id}` ? runAction(b, "retry_game") : setConfirming(`retry:${b.id}`))}
                    className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-400 hover:bg-amber-500/20"
                  >
                    {confirming === `retry:${b.id}` ? "Confirm?" : "Retry game"}
                  </button>
                )}
                </div>
              </div>
            </div>
          ))}
          {/* pagination */}
          <div className="flex items-center justify-between border-t border-ccb-border bg-ccb-card px-4 py-2 text-[11px] text-ccb-muted">
            <span>{total} battle{total === 1 ? "" : "s"} · page {page}</span>
            <div className="flex gap-1.5">
              <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border border-ccb-border px-2 py-0.5 hover:text-white disabled:opacity-40">Prev</button>
              <button disabled={page * 50 >= total} onClick={() => setPage((p) => p + 1)} className="rounded border border-ccb-border px-2 py-0.5 hover:text-white disabled:opacity-40">Next</button>
            </div>
          </div>
        </div>
      )}

      {/* view drawer */}
      {viewing && (
        <>
          <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setViewing(null)} />
          <div className="fixed inset-y-0 right-0 z-50 w-[520px] max-w-full overflow-y-auto border-l border-ccb-border bg-ccb-card p-5 shadow-2xl">
            <div className="mb-4 flex items-start justify-between border-b border-ccb-border pb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Battle detail</h3>
                <p className="font-mono text-[10px] text-ccb-muted">{viewing.id}</p>
              </div>
              <button onClick={() => setViewing(null)} className="rounded p-1 text-ccb-muted hover:bg-ccb-surface hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-ccb-border bg-ccb-surface p-2.5">
                  <span className="text-[10px] uppercase tracking-wider text-ccb-muted">White</span>
                  <p className="truncate font-semibold text-white">{nameOf(viewing.white_player, viewing.white_player_id)}</p>
                  <p className="text-ccb-muted">{viewing.white_rating ?? "—"} elo · {viewing.white_player?.country || "—"}</p>
                </div>
                <div className="rounded-lg border border-ccb-border bg-ccb-surface p-2.5">
                  <span className="text-[10px] uppercase tracking-wider text-ccb-muted">Black</span>
                  <p className="truncate font-semibold text-white">{nameOf(viewing.black_player, viewing.black_player_id)}</p>
                  <p className="text-ccb-muted">{viewing.black_rating ?? "—"} elo · {viewing.black_player?.country || "—"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-ccb-border bg-ccb-surface p-2.5 text-[11px]">
                <div><span className="text-ccb-muted">Status: </span><span className="text-white">{viewing.stuck ? "stuck" : viewing.status}</span></div>
                <div><span className="text-ccb-muted">Settled: </span><span className="text-white">{viewing.settled ? "yes" : "no"}</span></div>
                <div><span className="text-ccb-muted">Stake: </span><span className="text-white">{fmtUsd(viewing.stakeUsd)}</span></div>
                <div><span className="text-ccb-muted">Pot: </span><span className="text-white">{fmtUsd(viewing.potUsd)}</span></div>
                <div><span className="text-ccb-muted">Rake: </span><span className="text-white">{fmtUsd(viewing.platformFeeUsd)}</span></div>
                <div><span className="text-ccb-muted">Winner payout: </span><span className="text-white">{fmtUsd(viewing.winnerPayoutUsd)}</span></div>
                <div><span className="text-ccb-muted">Time control: </span><span className="text-white">{viewing.time_control || "—"}</span></div>
                <div><span className="text-ccb-muted">Result: </span><span className="text-white">{viewing.result || (viewing.winner ? nameOf(viewing.winner, viewing.winner_id || "") : "—")}</span></div>
                <div><span className="text-ccb-muted">Created: </span><span className="text-white">{fmtDateTime(viewing.created_at)}</span></div>
                <div><span className="text-ccb-muted">Completed: </span><span className="text-white">{viewing.completed_at ? fmtDateTime(viewing.completed_at) : "—"}</span></div>
                <div className="col-span-2"><span className="text-ccb-muted">Game: </span><span className="font-mono text-white">{viewing.game_id || "none"}</span></div>
                {viewing.armageddon_game_id && (
                  <div className="col-span-2"><span className="text-ccb-muted">Armageddon game: </span><span className="font-mono text-white">{viewing.armageddon_game_id} (round {viewing.armageddon_round ?? "—"})</span></div>
                )}
                {viewing.notes && <div className="col-span-2"><span className="text-ccb-muted">Notes: </span><span className="text-white">{viewing.notes}</span></div>}
              </div>
              {!viewing.settled && viewing.status !== "cancelled" && (
                <button
                  onClick={() => { setSettling(viewing); setSettleWinner(viewing.white_player_id); setViewing(null); }}
                  className="w-full rounded-lg bg-violet-600 py-2 text-xs font-semibold text-white hover:bg-violet-500"
                >
                  Set result (force settle)
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* set-result modal */}
      {settling && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setSettling(null)}>
          <div className="w-full max-w-sm rounded-xl border border-ccb-border bg-ccb-surface p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold text-white">Set battle result</h3>
              <button onClick={() => setSettling(null)} className="text-ccb-muted hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-3 text-[11px] text-ccb-muted">
              {nameOf(settling.white_player, settling.white_player_id)} vs {nameOf(settling.black_player, settling.black_player_id)} — pot {fmtUsd(settling.potUsd)} will be settled to the winner (rake applied).
            </p>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {(["white", "black"] as const).map((side) => {
                const pid = side === "white" ? settling.white_player_id : settling.black_player_id;
                return (
                  <button
                    key={side}
                    onClick={() => setSettleWinner(pid)}
                    className={`truncate rounded-lg border px-2 py-2 text-[11px] font-semibold ${
                      settleWinner === pid ? "border-violet-500/50 bg-violet-600/20 text-white" : "border-ccb-border bg-ccb-card text-ccb-muted"
                    }`}
                  >
                    {side === "white" ? nameOf(settling.white_player, settling.white_player_id) : nameOf(settling.black_player, settling.black_player_id)}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setSettling(null)} className="rounded-lg border border-ccb-border px-3 py-1.5 text-xs text-ccb-muted hover:text-white">Cancel</button>
              <button
                onClick={() => { runAction(settling, "force_settle", { winnerId: settleWinner }); setSettling(null); }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
              >
                <Check className="h-3 w-3" /> Settle to winner
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
