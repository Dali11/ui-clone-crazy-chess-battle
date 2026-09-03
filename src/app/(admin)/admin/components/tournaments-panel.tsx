"use client";

import { useState } from "react";
import {
  Trophy, Loader2, Check, X, Search, Save, Copy, Trash2, Edit3, Share2,
  Gift, Calendar, ChevronDown, Plus, AlertCircle, ChevronRight, Clock,
  DollarSign, FileText, Link, Play, Shield, Smartphone, Swords, TrendingUp, Users, Gavel,
} from "lucide-react";
import PlatformSettingsPanel from "../platform-settings-panel";
import { type Tournament, localToUTC, utcToLocalInput } from "../types";

interface TournamentsPanelProps {
  tournaments: Tournament[];
  tournamentStats: any;
  tournamentFilter: string;
  setTournamentFilter: (v: string) => void;
  tournamentSearch: string;
  setTournamentSearch: (v: string) => void;
  editingTournament: Tournament | null;
  setEditingTournament: (t: Tournament | null) => void;
  editForm: Record<string, any>;
  setEditForm: (v: Record<string, any>) => void;
  prizeEditTournament: Tournament | null;
  setPrizeEditTournament: (t: Tournament | null) => void;
  prizeForm: any;
  setPrizeForm: (v: any) => void;
  creatingTournament: boolean;
  setCreatingTournament: (v: boolean) => void;
  createForm: Record<string, any>;
  setCreateForm: (v: Record<string, any> | ((prev: Record<string, any>) => Record<string, any>)) => void;
  managingTournament: Tournament | null;
  setManagingTournament: (t: Tournament | null) => void;
  tournamentDetail: any;
  setTournamentDetail: (v: any) => void;
  detailLoading: boolean;
  actionLoading: string | null;
  handleTournamentAction: (id: string, action: string) => Promise<void>;
  handleTournamentEdit: (t: Tournament) => void;
  saveTournamentEdit: () => Promise<void>;
  handleTournamentDelete: (id: string) => Promise<void>;
  handleTournamentDuplicate: (id: string) => Promise<void>;
  handleTournamentShare: (t: Tournament) => void;
  handlePrizeEdit: (t: Tournament) => void;
  savePrizeEdit: () => Promise<void>;
  handleCreateTournament: () => Promise<void>;
  fetchTournamentDetail: (t: Tournament) => Promise<void>;
  handleAdminTournamentAction: (action: string) => Promise<void>;
  updatePrizePayout: (index: number, field: string, value: any) => void;
  formatMWK: (amount: number) => string;
  formatDate: (d: string) => string;
}

export default function TournamentsPanel({
  tournaments,
  tournamentStats,
  tournamentFilter,
  setTournamentFilter,
  tournamentSearch,
  setTournamentSearch,
  editingTournament,
  setEditingTournament,
  editForm,
  setEditForm,
  prizeEditTournament,
  setPrizeEditTournament,
  prizeForm,
  setPrizeForm,
  creatingTournament,
  setCreatingTournament,
  createForm,
  setCreateForm,
  managingTournament,
  setManagingTournament,
  tournamentDetail,
  setTournamentDetail,
  detailLoading,
  actionLoading,
  handleTournamentAction,
  handleTournamentEdit,
  saveTournamentEdit,
  handleTournamentDelete,
  handleTournamentDuplicate,
  handleTournamentShare,
  handlePrizeEdit,
  savePrizeEdit,
  handleCreateTournament,
  fetchTournamentDetail,
  handleAdminTournamentAction,
  updatePrizePayout,
  formatMWK,
  formatDate,
}: TournamentsPanelProps) {
  const [overridePair, setOverridePair] = useState<any>(null);
  const [overrideRound, setOverrideRound] = useState<number | null>(null);
  const [overrideWinner, setOverrideWinner] = useState<"white" | "black" | "draw" | null>(null);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);

  const submitOverride = async () => {
    if (!managingTournament || !overridePair || !overrideRound || !overrideWinner) return;
    setOverrideLoading(true);
    setOverrideError(null);
    try {
      const res = await fetch(`/api/admin/tournaments/${managingTournament.id}/override-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roundNumber: overrideRound,
          whiteId: overridePair.white,
          blackId: overridePair.black,
          winner: overrideWinner,
          note: `Admin override from tournament panel (round ${overrideRound})`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set result");
      setOverridePair(null);
      setOverrideWinner(null);
      await fetchTournamentDetail(managingTournament);
    } catch (err: any) {
      setOverrideError(err.message || "Failed");
    } finally {
      setOverrideLoading(false);
    }
  };

  const filteredTournaments = tournaments.filter((t) => {
    const matchFilter = tournamentFilter === "all" || t.status === tournamentFilter;
    const q = tournamentSearch.toLowerCase();
    const matchSearch = !q || t.name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const addPrizePayout = () => {
    const updated = { ...prizeForm };
    updated.payouts = [...updated.payouts, { rank: updated.payouts.length + 1, percentage: 0 }];
    setPrizeForm(updated);
  };

  const removePrizePayout = (index: number) => {
    const updated = { ...prizeForm };
    updated.payouts = updated.payouts.filter((_: any, i: number) => i !== index);
    setPrizeForm(updated);
  };

  return (
    <div className="space-y-4">
        <PlatformSettingsPanel section="tournaments" />
        {/* STATS CARDS */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <div className="card p-3 text-center">
            <div className="text-xl font-bold">{tournamentStats.total}</div>
            <div className="text-[10px] uppercase tracking-wider text-ccb-muted">Total</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-bold text-ccb-primary">{tournamentStats.upcoming}</div>
            <div className="text-[10px] uppercase tracking-wider text-ccb-muted">Upcoming</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-bold text-ccb-success">{tournamentStats.active}</div>
            <div className="text-[10px] uppercase tracking-wider text-ccb-muted">Active</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-bold text-ccb-muted">{tournamentStats.finished}</div>
            <div className="text-[10px] uppercase tracking-wider text-ccb-muted">Done</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-bold text-ccb-accent">{tournamentStats.pending}</div>
            <div className="text-[10px] uppercase tracking-wider text-ccb-muted">Pending</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-bold text-ccb-danger">{tournamentStats.cancelled}</div>
            <div className="text-[10px] uppercase tracking-wider text-ccb-muted">Cancelled</div>
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Search tournaments..."
            value={tournamentSearch}
            onChange={(e) => setTournamentSearch(e.target.value)}
            className="input-field flex-1 min-w-[150px]"
          />
          <select
            value={tournamentFilter}
            onChange={(e) => setTournamentFilter(e.target.value)}
            className="input-field w-auto"
          >
            <option value="all">All Status</option>
            <option value="upcoming">Upcoming</option>
            <option value="active">Active</option>
            <option value="pending_approval">Pending</option>
            <option value="finished">Finished</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="rejected">Rejected</option>
          </select>
          <button
            onClick={() => {
              setCreatingTournament(true);
              setCreateForm({
                name: "",
                description: "",
                type: "swiss",
                time_control: "blitz",
                initial_minutes: 5,
                increment_seconds: 0,
                max_players: "",
                min_players: 2,
                rounds: "",
                duration_minutes: "",
                starts_at: "",
                ends_at: "",
                entry_fee: 0,
                creator_profit_percent: 0,
                prize_pool: 0,
                pool_source: 'entry_fees',
                min_rating: 0,
                max_rating: "",
              });
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-ccb-primary text-white text-sm font-bold hover:opacity-90 shrink-0"
          >
            <Trophy className="w-4 h-4" /> Create
          </button>
        </div>

        {/* REVENUE SUMMARY */}
        {tournaments.length > 0 && (() => {
          const totalRevenue = tournaments.reduce((sum, t) => sum + (t.revenue || 0), 0);
          const totalPrizePool = tournaments.reduce((sum, t) => sum + (t.prize_pool || 0), 0);
          const totalPaid = tournaments.reduce((sum, t) => sum + (t.paid_count || 0), 0);
          if (totalRevenue === 0) return null;
          return (
            <div className="flex items-center gap-4 px-3 py-2 mb-2 rounded-lg bg-ccb-success/5 border border-ccb-success/20 text-xs">
              <span className="flex items-center gap-1.5 font-medium text-ccb-success">
                <TrendingUp className="w-3.5 h-3.5" />
                Total Revenue: {formatMWK(totalRevenue)}
              </span>
              <span className="text-ccb-muted">·</span>
              <span className="text-ccb-muted">{totalPaid} paid entries</span>
              <span className="text-ccb-muted">·</span>
              <span className="text-ccb-muted">Prize pools: {formatMWK(totalPrizePool)}</span>
            </div>
          );
        })()}

        {/* TOURNAMENT LIST */}
        {filteredTournaments.length === 0 ? (
          <div className="text-center py-12 text-ccb-muted text-sm">
            <Trophy className="w-8 h-8 mx-auto mb-2 opacity-50" />
            {tournaments.length === 0 ? "No tournaments yet. Create one!" : "No tournaments match your filter."}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTournaments.map((t) => (
              <div key={t.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      {t.name}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        t.status === "active" ? "bg-ccb-success/10 text-ccb-success border border-ccb-success/30" :
                        t.status === "upcoming" ? "bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30" :
                        t.status === "finished" || t.status === "completed" ? "bg-ccb-muted/10 text-ccb-muted border border-ccb-muted/30" :
                        t.status === "cancelled" ? "bg-ccb-danger/10 text-ccb-danger border border-ccb-danger/30" :
                        t.status === "pending_approval" ? "bg-ccb-accent/10 text-ccb-accent border border-ccb-accent/30" :
                        t.status === "rejected" ? "bg-red-500/10 text-red-500 border border-red-500/30" :
                        "bg-ccb-surface text-ccb-muted border border-ccb-border"
                      }`}>{t.status.replace(/_/g, " ")}</span>
                      <span className="text-[10px] uppercase text-ccb-muted border border-ccb-border rounded px-1.5 py-0.5">{t.type}</span>
                    </div>
                    <div className="text-xs text-ccb-muted mt-1.5 flex items-center gap-2 flex-wrap">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{t.time_control} · {t.initial_minutes}+{t.increment_seconds}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{t.participant_count}/{t.max_players ?? "\u221e"}</span>
                      {t.rounds && <span className="flex items-center gap-1"><Trophy className="w-3 h-3" />R{t.current_round}/{t.rounds}</span>}
                      <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />{formatMWK(t.entry_fee)}</span>
                      <span className="flex items-center gap-1"><Gift className="w-3 h-3" />{formatMWK(t.prize_pool)}</span>
                      {(t.revenue || 0) > 0 && (
                        <span className="flex items-center gap-1 text-ccb-success font-medium"><TrendingUp className="w-3 h-3" />{formatMWK(t.revenue || 0)} ({t.paid_count || 0} paid)</span>
                      )}
                      {t.pool_source === 'fixed' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-ccb-accent/10 text-ccb-accent border border-ccb-accent/30">FIXED</span>
                      )}
                    </div>
                    {t.description && (
                      <div className="text-xs text-ccb-muted mt-1 line-clamp-1">{t.description}</div>
                    )}
                    <div className="text-[10px] text-ccb-muted mt-1">{formatDate(t.starts_at)}</div>
                  </div>
                </div>

                {/* ACTION BUTTONS */}
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-ccb-border">
                  {/* Manage — always available */}
                  <button
                    onClick={() => fetchTournamentDetail(t)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-primary text-sm font-medium hover:bg-ccb-primary/10 disabled:opacity-50"
                  >
                    <ChevronRight className="w-3.5 h-3.5" /> Manage
                  </button>

                  {/* Approve — pending_approval only */}
                  {t.status === "pending_approval" && (
                    <>
                      <button
                        onClick={() => handleTournamentAction(t.id, "approve")}
                        disabled={actionLoading === `${t.id}_approve`}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-success text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        {actionLoading === `${t.id}_approve` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Approve
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Reject this tournament? Any paid entry fees will be refunded.")) {
                            handleTournamentAction(t.id, "reject");
                          }
                        }}
                        disabled={actionLoading === `${t.id}_reject`}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-danger text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        {actionLoading === `${t.id}_reject` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                        Reject
                      </button>
                    </>
                  )}

                  {/* Edit — upcoming or active */}
                  {(t.status === "upcoming" || t.status === "active") && (
                    <button
                      onClick={() => handleTournamentEdit(t)}
                      disabled={actionLoading === `${t.id}_edit`}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-primary text-sm font-medium hover:bg-ccb-accent/10 disabled:opacity-50"
                    >
                      {actionLoading === `${t.id}_edit` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Edit3 className="w-3.5 h-3.5" />}
                      Edit
                    </button>
                  )}

                  {/* Edit Prizes — upcoming or active */}
                  {(t.status === "upcoming" || t.status === "active") && (
                    <button
                      onClick={() => handlePrizeEdit(t)}
                      disabled={actionLoading === `${t.id}_edit_prizes`}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-accent text-sm font-medium hover:bg-ccb-accent/10 disabled:opacity-50"
                    >
                      {actionLoading === `${t.id}_edit_prizes` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gift className="w-3.5 h-3.5" />}
                      Prizes
                    </button>
                  )}

                  {/* Duplicate — any status */}
                  <button
                    onClick={() => handleTournamentDuplicate(t.id)}
                    disabled={actionLoading === `${t.id}_duplicate`}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted text-sm font-medium hover:bg-ccb-muted/10 disabled:opacity-50"
                  >
                    {actionLoading === `${t.id}_duplicate` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                    Duplicate
                  </button>

                  {/* Share — copy invite link */}
                  <button
                    onClick={() => handleTournamentShare(t)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted text-sm font-medium hover:bg-ccb-muted/10"
                  >
                    <Share2 className="w-3.5 h-3.5" /> Share
                  </button>

                  {/* Cancel & Refund — upcoming or active */}
                  {(t.status === "upcoming" || t.status === "active") && (
                    <button
                      onClick={() => handleTournamentAction(t.id, "cancel")}
                      disabled={actionLoading === `${t.id}_cancel`}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-danger/90 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      {actionLoading === `${t.id}_cancel` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                      Cancel
                    </button>
                  )}

                  {/* Force Finish — active only */}
                  {t.status === "active" && (
                    <button
                      onClick={() => handleTournamentAction(t.id, "force_finish")}
                      disabled={actionLoading === `${t.id}_force_finish`}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-accent/90 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      {actionLoading === `${t.id}_force_finish` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Force Finish
                    </button>
                  )}

                  {/* Payout Prizes — finished tournaments with a prize pool (fixes tournaments that finished before prize distribution was wired up; safe to re-run, won't double-pay) */}
                  {(t.status === "finished" || t.status === "completed") && (t.prize_pool || 0) > 0 && (
                    <button
                      onClick={() => handleTournamentAction(t.id, "force_finish")}
                      disabled={actionLoading === `${t.id}_force_finish`}
                      title="Re-run prize distribution for this tournament. Safe to click even if prizes were already paid — it won't pay twice."
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-accent/90 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      {actionLoading === `${t.id}_force_finish` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gift className="w-3.5 h-3.5" />}
                      Payout Prizes
                    </button>
                  )}

                  {/* Delete — any status (active tournaments get entry fees refunded) */}
                  {(t.status === "upcoming" || t.status === "cancelled" || t.status === "finished" || t.status === "active") && (
                    <button
                      onClick={() => handleTournamentDelete(t.id)}
                      disabled={actionLoading === `${t.id}_delete`}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-danger/10 text-ccb-danger border border-ccb-danger/30 text-sm font-medium hover:bg-ccb-danger/20 disabled:opacity-50"
                    >
                      {actionLoading === `${t.id}_delete` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CREATE TOURNAMENT MODAL */}
        {creatingTournament && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-ccb-card rounded-xl border border-ccb-border max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-ccb-accent" /> Create Tournament
                </h3>
                <button onClick={() => setCreatingTournament(false)} className="text-ccb-muted hover:text-ccb-fg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-ccb-muted">Tournament Name *</label>
                  <input type="text" value={createForm.name || ""} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} className="input-field mt-1 w-full" placeholder="e.g. Malawi Swiss Qualifier #1" />
                </div>
                <div>
                  <label className="text-xs font-medium text-ccb-muted">Description</label>
                  <textarea value={createForm.description || ""} onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })} className="input-field mt-1 w-full" rows={2} placeholder="Optional description" />
                </div>
                {/* THUMBNAIL */}
                <div>
                  <label className="text-xs font-medium text-ccb-muted">Thumbnail Image (optional)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => setCreateForm({ ...createForm, thumbnail_data_url: reader.result });
                      reader.readAsDataURL(file);
                      setCreateForm(prev => ({ ...prev, thumbnail_file_name: file.name }));
                    }}
                    className="input-field mt-1 w-full text-xs"
                  />
                  {createForm.thumbnail_data_url && (
                    <div className="mt-2 relative rounded-xl overflow-hidden h-24">
                      <img src={createForm.thumbnail_data_url} alt="Preview" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setCreateForm({ ...createForm, thumbnail_data_url: null, thumbnail_file_name: null })}
                        className="absolute top-1 right-1 bg-ccb-danger/90 text-white rounded-full p-1 hover:bg-ccb-danger"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Type</label>
                    <select value={createForm.type || "swiss"} onChange={(e) => { const t = e.target.value; setCreateForm({ ...createForm, type: t, duration_minutes: t === "arena" ? "120" : createForm.duration_minutes, rounds: t === "arena" ? "" : createForm.rounds }); }} className="input-field mt-1 w-full">
                      <option value="swiss">Swiss</option>
                      <option value="arena">Arena</option>
                      <option value="knockout">Knockout</option>
                    </select>
                  </div>
                  {(createForm.type === "knockout") && (
                    <div>
                      <label className="text-xs font-medium text-ccb-muted">Knockout Format</label>
                      <select value={createForm.knockout_format || "pure"} onChange={(e) => setCreateForm({ ...createForm, knockout_format: e.target.value })} className="input-field mt-1 w-full">
                        <option value="pure">Pure Knockout (single elimination)</option>
                        <option value="group_stage">Group Stage → Knockout</option>
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Time Control</label>
                    <select value={createForm.time_control || "rapid"} onChange={(e) => setCreateForm({ ...createForm, time_control: e.target.value })} className="input-field mt-1 w-full">
                      <option value="bullet">Bullet</option>
                      <option value="blitz">Blitz</option>
                      <option value="rapid">Rapid</option>
                      <option value="classical">Classical</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Initial Minutes</label>
                    <input type="number" value={createForm.initial_minutes ?? 10} onChange={(e) => setCreateForm({ ...createForm, initial_minutes: e.target.value })} className="input-field mt-1 w-full" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Increment (sec)</label>
                    <input type="number" value={createForm.increment_seconds ?? 5} onChange={(e) => setCreateForm({ ...createForm, increment_seconds: e.target.value })} className="input-field mt-1 w-full" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Min Players</label>
                    <input type="number" value={createForm.min_players ?? 2} onChange={(e) => setCreateForm({ ...createForm, min_players: e.target.value })} className="input-field mt-1 w-full" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Max Players (blank = ∞)</label>
                    <input type="number" value={createForm.max_players ?? ""} onChange={(e) => setCreateForm({ ...createForm, max_players: e.target.value })} className="input-field mt-1 w-full" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Rounds (blank = arena)</label>
                    <input type="number" value={createForm.rounds ?? ""} onChange={(e) => setCreateForm({ ...createForm, rounds: e.target.value })} className="input-field mt-1 w-full" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Duration (min)</label>
                    <input type="number" value={createForm.duration_minutes ?? ""} onChange={(e) => setCreateForm({ ...createForm, duration_minutes: e.target.value })} className="input-field mt-1 w-full" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Min Rating</label>
                    <input type="number" value={createForm.min_rating ?? 0} onChange={(e) => setCreateForm({ ...createForm, min_rating: e.target.value })} className="input-field mt-1 w-full" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Max Rating (blank = none)</label>
                    <input type="number" value={createForm.max_rating ?? ""} onChange={(e) => setCreateForm({ ...createForm, max_rating: e.target.value })} className="input-field mt-1 w-full" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-ccb-muted">Start Time *</label>
                  <input type="datetime-local" value={createForm.starts_at || ""} onChange={(e) => setCreateForm({ ...createForm, starts_at: e.target.value })} className="input-field mt-1 w-full" />
                </div>
                <div>
                  <label className="text-xs font-medium text-ccb-muted">End Time (optional)</label>
                  <input type="datetime-local" value={createForm.ends_at || ""} onChange={(e) => setCreateForm({ ...createForm, ends_at: e.target.value })} className="input-field mt-1 w-full" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Entry Fee (MK)</label>
                    <input type="number" min={0} max={5000} value={createForm.entry_fee ?? 0} onChange={(e) => setCreateForm({ ...createForm, entry_fee: Math.min(Number(e.target.value), 5000) })} className="input-field mt-1 w-full" placeholder="0 = free" />
                      <p className="text-[10px] text-ccb-muted mt-1">Max MK 5,000</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Creator Profit %</label>
                    <input type="number" value={createForm.creator_profit_percent ?? 0} onChange={(e) => setCreateForm({ ...createForm, creator_profit_percent: e.target.value })} className="input-field mt-1 w-full" />
                  </div>
                </div>
                {/* Prize Pool Source */}
                <div>
                  <label className="text-xs font-medium text-ccb-muted">Prize Pool Source</label>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setCreateForm({ ...createForm, pool_source: 'entry_fees' })}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${createForm.pool_source === 'entry_fees' || !createForm.pool_source ? 'bg-ccb-primary/10 text-ccb-primary border-ccb-primary/30' : 'bg-ccb-surface text-ccb-muted border-ccb-border'}`}
                    >
                      From Entry Fees
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateForm({ ...createForm, pool_source: 'fixed' })}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${createForm.pool_source === 'fixed' ? 'bg-ccb-primary/10 text-ccb-primary border-ccb-primary/30' : 'bg-ccb-surface text-ccb-muted border-ccb-border'}`}
                    >
                      Fixed Amount
                    </button>
                  </div>
                  <p className="text-[10px] text-ccb-muted mt-1">
                    {createForm.pool_source === 'fixed'
                      ? 'Admin sets a fixed prize pool. Entry fees still charged but do NOT add to the pool.'
                      : 'Prize pool grows as players join and pay entry fees. Default behavior.'}
                  </p>
                </div>
                {/* Fixed Prize Pool Amount (only shown when pool_source = 'fixed') */}
                {createForm.pool_source === 'fixed' && (
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Fixed Prize Pool (MK)</label>
                    <input type="number" value={createForm.prize_pool ?? 0} onChange={(e) => setCreateForm({ ...createForm, prize_pool: e.target.value })} className="input-field mt-1 w-full" placeholder="e.g. 50000 = MK 50,000" />
                    <p className="text-[10px] text-ccb-muted mt-1">This amount is guaranteed by the platform regardless of player count.</p>
                  </div>
                )}
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleCreateTournament}
                  disabled={actionLoading === "create_tournament" || !createForm.name || !createForm.starts_at}
                  className="flex items-center gap-1 px-4 py-2 rounded-lg bg-ccb-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {actionLoading === "create_tournament" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trophy className="w-4 h-4" />}
                  Create Tournament
                </button>
                <button onClick={() => setCreatingTournament(false)} className="px-4 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted text-sm font-medium hover:bg-ccb-muted/10">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MANAGE TOURNAMENT MODAL */}
        {managingTournament && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-ccb-card rounded-xl border border-ccb-border max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold">{managingTournament.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    managingTournament.status === "active" ? "bg-ccb-success/10 text-ccb-success border border-ccb-success/30" :
                    managingTournament.status === "upcoming" ? "bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30" :
                    managingTournament.status === "finished" || managingTournament.status === "completed" ? "bg-ccb-muted/10 text-ccb-muted border border-ccb-muted/30" :
                    "bg-ccb-surface text-ccb-muted border border-ccb-border"
                  }`}>{managingTournament.status.replace(/_/g, " ")}</span>
                </div>
                <button onClick={() => { setManagingTournament(null); setTournamentDetail(null); }} className="text-ccb-muted hover:text-ccb-fg">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tournament Info Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                <div className="bg-ccb-surface rounded-lg p-2.5">
                  <div className="text-[10px] uppercase text-ccb-muted">Type</div>
                  <div className="font-bold capitalize">{managingTournament.type}</div>
                </div>
                <div className="bg-ccb-surface rounded-lg p-2.5">
                  <div className="text-[10px] uppercase text-ccb-muted">Time</div>
                  <div className="font-bold">{managingTournament.initial_minutes}+{managingTournament.increment_seconds}</div>
                </div>
                <div className="bg-ccb-surface rounded-lg p-2.5">
                  <div className="text-[10px] uppercase text-ccb-muted">Players</div>
                  <div className="font-bold">{managingTournament.participant_count}/{managingTournament.max_players ?? "\u221e"}</div>
                </div>
                <div className="bg-ccb-surface rounded-lg p-2.5">
                  <div className="text-[10px] uppercase text-ccb-muted">Entry</div>
                  <div className="font-bold">{formatMWK(managingTournament.entry_fee)}</div>
                </div>
              </div>

              {/* Revenue Breakdown */}
              {(() => {
                const rev = tournamentDetail?.revenue;
                if (!rev || (rev.totalCollected || 0) === 0) return null;
                return (
                  <div className="bg-ccb-surface rounded-lg p-3 space-y-2 border border-ccb-border">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-ccb-fg">
                      <TrendingUp className="w-3.5 h-3.5 text-ccb-success" />
                      Revenue Breakdown
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-ccb-muted">Entry fee</span>
                        <span className="font-medium">{formatMWK(rev.entryFee)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ccb-muted">Paid players</span>
                        <span className="font-medium">{rev.paidParticipants}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ccb-muted">Total collected</span>
                        <span className="font-medium text-ccb-success">{formatMWK(rev.totalCollected)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-ccb-muted">Prize pool</span>
                        <span className="font-medium">{formatMWK(rev.prizePool)}</span>
                      </div>
                      {rev.poolSource === 'fixed' && rev.platformRevenue > 0 && (
                        <div className="flex justify-between col-span-2 pt-1 border-t border-ccb-border">
                          <span className="text-ccb-muted">Platform revenue (fixed pool surplus)</span>
                          <span className="font-bold text-ccb-success">{formatMWK(rev.platformRevenue)}</span>
                        </div>
                      )}
                      {rev.creatorProfit > 0 && (
                        <>
                          <div className="flex justify-between">
                            <span className="text-ccb-muted">Creator profit ({rev.creatorProfitPercent}%)</span>
                            <span className="font-medium text-ccb-primary">{formatMWK(rev.creatorProfit)}</span>
                          </div>
                          <div className="flex justify-between col-span-2 pt-1 border-t border-ccb-border">
                            <span className="text-ccb-muted">Actual prizes distributed</span>
                            <span className="font-bold">{formatMWK(rev.actualPrizePool)}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Admin Action Buttons */}
              <div className="flex flex-wrap gap-2 pb-2 border-b border-ccb-border">
                {managingTournament.status === "upcoming" && managingTournament.participant_count >= 2 && (
                  <button
                    onClick={() => handleAdminTournamentAction("start")}
                    disabled={actionLoading === "admin_start"}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-success text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {actionLoading === "admin_start" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    Start Now
                  </button>
                )}
                {managingTournament.status === "active" && (
                  <button
                    onClick={() => handleAdminTournamentAction("advance_round")}
                    disabled={actionLoading === "admin_advance_round"}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {actionLoading === "admin_advance_round" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    Advance Round
                  </button>
                )}
                {managingTournament.status === "active" && (
                  <button
                    onClick={() => handleAdminTournamentAction("force_finish")}
                    disabled={actionLoading === "admin_force_finish"}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-accent/90 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {actionLoading === "admin_force_finish" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    Force Finish
                  </button>
                )}
                {(managingTournament.status === "finished" || managingTournament.status === "completed") && (managingTournament.prize_pool || 0) > 0 && (
                  <button
                    onClick={() => handleAdminTournamentAction("force_finish")}
                    disabled={actionLoading === "admin_force_finish"}
                    title="Re-run prize distribution for this tournament. Safe to click even if prizes were already paid — it won't pay twice."
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-accent/90 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {actionLoading === "admin_force_finish" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Gift className="w-3.5 h-3.5" />}
                    Payout Prizes
                  </button>
                )}
                {(managingTournament.status === "upcoming" || managingTournament.status === "active") && (
                  <button
                    onClick={() => handleAdminTournamentAction("cancel")}
                    disabled={actionLoading === "admin_cancel"}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-danger/90 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {actionLoading === "admin_cancel" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                    Cancel & Refund
                  </button>
                )}
                {(managingTournament.status === "upcoming" || managingTournament.status === "active") && (
                  <button
                    onClick={() => { handleTournamentEdit(managingTournament); setManagingTournament(null); setTournamentDetail(null); }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-primary text-sm font-medium hover:bg-ccb-accent/10"
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Edit
                  </button>
                )}
                {(managingTournament.status === "upcoming" || managingTournament.status === "active") && (
                  <button
                    onClick={() => { handlePrizeEdit(managingTournament); setManagingTournament(null); setTournamentDetail(null); }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-accent text-sm font-medium hover:bg-ccb-accent/10"
                  >
                    <Gift className="w-3.5 h-3.5" /> Prizes
                  </button>
                )}
                <button
                  onClick={() => { handleTournamentDuplicate(managingTournament.id); setManagingTournament(null); setTournamentDetail(null); }}
                  disabled={actionLoading === `${managingTournament.id}_duplicate`}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted text-sm font-medium hover:bg-ccb-muted/10 disabled:opacity-50"
                >
                  {actionLoading === `${managingTournament.id}_duplicate` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />}
                  Duplicate
                </button>
                <button
                  onClick={() => handleTournamentShare(managingTournament)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted text-sm font-medium hover:bg-ccb-muted/10"
                >
                  <Share2 className="w-3.5 h-3.5" /> Share
                </button>
                <Link href={`/tournament/${managingTournament.id}`} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-primary text-sm font-medium hover:bg-ccb-primary/10">
                  <Swords className="w-3.5 h-3.5" /> View Page
                </Link>
                {(managingTournament.status === "upcoming" || managingTournament.status === "cancelled" || managingTournament.status === "finished" || managingTournament.status === "active") && (
                  <button
                    onClick={() => { handleTournamentDelete(managingTournament.id); setManagingTournament(null); setTournamentDetail(null); }}
                    disabled={actionLoading === `${managingTournament.id}_delete`}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-danger/10 text-ccb-danger border border-ccb-danger/30 text-sm font-medium hover:bg-ccb-danger/20 disabled:opacity-50"
                  >
                    {actionLoading === `${managingTournament.id}_delete` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                    Delete
                  </button>
                )}
              </div>

              {/* Detail Content */}
              {detailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-ccb-muted" />
                </div>
              ) : tournamentDetail?.error ? (
                <div className="text-center py-8 text-sm text-ccb-danger">
                  <AlertCircle className="w-8 h-8 mx-auto mb-2" />
                  {tournamentDetail.error}
                </div>
              ) : tournamentDetail ? (
                <>
                  {/* Participants */}
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-2 flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> Participants ({tournamentDetail.participants?.length || 0})
                    </h4>
                    {tournamentDetail.participants?.length === 0 ? (
                      <p className="text-xs text-ccb-muted">No participants registered yet.</p>
                    ) : (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {tournamentDetail.participants?.map((p: any, i: number) => (
                          <div key={p.player_id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ccb-surface text-sm">
                            <span className="text-xs font-bold text-ccb-muted w-6 text-center">#{p.seed || i + 1}</span>
                            {p.profile?.avatar_url ? (
                              <img src={p.profile.avatar_url} alt="" className="w-6 h-6 rounded-full shrink-0" />
                            ) : (
                              <div className="w-6 h-6 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center text-[10px] font-bold text-ccb-muted shrink-0">
                                {(p.profile?.display_name || p.profile?.username || "?").charAt(0)}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{p.profile?.display_name || p.profile?.username || "Unknown"}</div>
                            </div>
                            <div className="text-xs text-ccb-muted">Rating: {p.profile?.rating || "\u2014"}</div>
                            <div className="text-xs font-bold">{p.score?.toFixed(1) || "0.0"}</div>
                            <div className="text-[10px] text-ccb-muted">{p.wins}W/{p.losses}L/{p.draws}D</div>
                            {p.paid_entry_fee && <span className="text-[10px] text-ccb-success font-bold">PAID</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Rounds */}
                  {tournamentDetail.rounds?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-ccb-muted mb-2 flex items-center gap-1.5">
                        <Swords className="w-3.5 h-3.5" /> Rounds ({tournamentDetail.rounds.length})
                      </h4>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {tournamentDetail.rounds.map((round: any) => (
                          <div key={round.id} className="rounded-lg border border-ccb-border overflow-hidden">
                            <div className="flex items-center justify-between px-3 py-2 bg-ccb-surface text-xs">
                              <span className="font-bold">Round {round.round_number}</span>
                              <span className={round.is_complete ? "text-ccb-success font-bold" : "text-ccb-accent font-bold"}>
                                {round.is_complete ? "COMPLETE" : "IN PROGRESS"}
                              </span>
                            </div>
                            <div className="divide-y divide-ccb-border/50">
                              {round.pairings?.map((pair: any, idx: number) => (
                                <div key={idx} className="px-3 py-2 flex items-center gap-2 text-xs">
                                  {pair.bye ? (
                                    <span className="text-ccb-muted flex-1">{pair.whiteName || "TBD"} <span className="text-ccb-success font-bold">BYE</span></span>
                                  ) : (
                                    <>
                                      <span className={`flex-1 truncate ${pair.result === "white" ? "font-bold text-ccb-success" : ""}`}>
                                        {pair.whiteName || "TBD"} ({pair.whiteRating || "\u2014"})
                                      </span>
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ccb-surface">
                                        {pair.result === "white" ? "1-0" : pair.result === "black" ? "0-1" : pair.result === "draw" ? "\u00bd-\u00bd" : "vs"}
                                      </span>
                                      <span className={`flex-1 truncate text-right ${pair.result === "black" ? "font-bold text-ccb-success" : ""}`}>
                                        ({pair.blackRating || "\u2014"}) {pair.blackName || "TBD"}
                                      </span>
                                      {pair.result == null && pair.white && pair.black && (
                                        <button
                                          onClick={() => {
                                            setOverridePair(pair);
                                            setOverrideRound(round.round_number);
                                            setOverrideWinner(null);
                                            setOverrideError(null);
                                          }}
                                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-ccb-surface border border-ccb-border text-[10px] font-bold text-ccb-accent hover:bg-ccb-accent/10 shrink-0"
                                          title="Manually record this match's result"
                                        >
                                          <Gavel className="w-3 h-3" /> Override
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          </div>
        )}

        {/* EDIT TOURNAMENT MODAL */}
        {editingTournament && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-ccb-card rounded-xl border border-ccb-border max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">Edit Tournament</h3>
                <button onClick={() => setEditingTournament(null)} className="text-ccb-muted hover:text-ccb-fg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-ccb-muted">Name</label>
                  <input type="text" value={editForm.name || ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="input-field mt-1 w-full" />
                </div>
                <div>
                  <label className="text-xs font-medium text-ccb-muted">Description</label>
                  <textarea value={editForm.description || ""} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} className="input-field mt-1 w-full" rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Type</label>
                    <select value={editForm.type || "swiss"} onChange={(e) => setEditForm({ ...editForm, type: e.target.value })} className="input-field mt-1 w-full">
                      <option value="swiss">Swiss</option>
                      <option value="arena">Arena</option>
                      <option value="knockout">Knockout</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Time Control</label>
                    <select value={editForm.time_control || "rapid"} onChange={(e) => setEditForm({ ...editForm, time_control: e.target.value })} className="input-field mt-1 w-full">
                      <option value="bullet">Bullet</option>
                      <option value="blitz">Blitz</option>
                      <option value="rapid">Rapid</option>
                      <option value="classical">Classical</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Initial Minutes</label>
                    <input type="number" value={editForm.initial_minutes ?? ""} onChange={(e) => setEditForm({ ...editForm, initial_minutes: e.target.value })} className="input-field mt-1 w-full" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Increment (sec)</label>
                    <input type="number" value={editForm.increment_seconds ?? ""} onChange={(e) => setEditForm({ ...editForm, increment_seconds: e.target.value })} className="input-field mt-1 w-full" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Max Players (blank = ∞)</label>
                    <input type="number" value={editForm.max_players ?? ""} onChange={(e) => setEditForm({ ...editForm, max_players: e.target.value })} className="input-field mt-1 w-full" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Rounds (blank = arena)</label>
                    <input type="number" value={editForm.rounds ?? ""} onChange={(e) => setEditForm({ ...editForm, rounds: e.target.value })} className="input-field mt-1 w-full" />
                  </div>
                </div>
                {editForm.type === "arena" && (
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Duration (minutes)</label>
                    <input type="number" value={editForm.duration_minutes ?? ""} onChange={(e) => setEditForm({ ...editForm, duration_minutes: e.target.value })} className="input-field mt-1 w-full" placeholder="e.g. 30" />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Min Rating</label>
                    <input type="number" value={editForm.min_rating ?? 0} onChange={(e) => setEditForm({ ...editForm, min_rating: e.target.value })} className="input-field mt-1 w-full" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Max Rating (blank = none)</label>
                    <input type="number" value={editForm.max_rating ?? ""} onChange={(e) => setEditForm({ ...editForm, max_rating: e.target.value })} className="input-field mt-1 w-full" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-ccb-muted">Start Time</label>
                  <input type="datetime-local" value={editForm.starts_at || ""} onChange={(e) => setEditForm({ ...editForm, starts_at: e.target.value })} className="input-field mt-1 w-full" />
                </div>
                <div>
                  <label className="text-xs font-medium text-ccb-muted">End Time (optional)</label>
                  <input type="datetime-local" value={editForm.ends_at || ""} onChange={(e) => setEditForm({ ...editForm, ends_at: e.target.value })} className="input-field mt-1 w-full" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Entry Fee (MK)</label>
                    <input type="number" min={0} max={5000} value={editForm.entry_fee ?? 0} onChange={(e) => setEditForm({ ...editForm, entry_fee: Math.min(Number(e.target.value), 5000) })} className="input-field mt-1 w-full" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-ccb-muted">Prize Pool (MK)</label>
                    <input type="number" value={editForm.prize_pool ?? 0} onChange={(e) => setEditForm({ ...editForm, prize_pool: e.target.value })} className="input-field mt-1 w-full" />
                  </div>
                </div>
                {/* Prize Pool Source */}
                <div>
                  <label className="text-xs font-medium text-ccb-muted">Prize Pool Source</label>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, pool_source: 'entry_fees' })}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${editForm.pool_source === 'entry_fees' || !editForm.pool_source ? 'bg-ccb-primary/10 text-ccb-primary border-ccb-primary/30' : 'bg-ccb-surface text-ccb-muted border-ccb-border'}`}
                    >
                      From Entry Fees
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, pool_source: 'fixed' })}
                      className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${editForm.pool_source === 'fixed' ? 'bg-ccb-primary/10 text-ccb-primary border-ccb-primary/30' : 'bg-ccb-surface text-ccb-muted border-ccb-border'}`}
                    >
                      Fixed Amount
                    </button>
                  </div>
                  <p className="text-[10px] text-ccb-muted mt-1">
                    {editForm.pool_source === 'fixed'
                      ? 'Fixed prize pool. Entry fees do NOT add to the pool.'
                      : 'Prize pool grows as players join and pay entry fees.'}
                  </p>
                </div>
                {/* Creator Profit % */}
                <div>
                  <label className="text-xs font-medium text-ccb-muted">Creator Profit (%)</label>
                  <input type="number" min="0" max="100" value={editForm.creator_profit_percent ?? 0} onChange={(e) => setEditForm({ ...editForm, creator_profit_percent: e.target.value })} className="input-field mt-1 w-full" />
                  <p className="text-[10px] text-ccb-muted mt-1">
                    {Number(editForm.creator_profit_percent) > 0
                      ? `Creator keeps ${editForm.creator_profit_percent}% of entry fees. Remaining ${100 - Number(editForm.creator_profit_percent)}% goes to the prize pool.`
                      : 'No creator profit. 100% of entry fees go to the prize pool.'}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={saveTournamentEdit} disabled={actionLoading === `${editingTournament.id}_edit`} className="flex items-center gap-1 px-4 py-2 rounded-lg bg-ccb-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
                  {actionLoading === `${editingTournament.id}_edit` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Changes
                </button>
                <button onClick={() => setEditingTournament(null)} className="px-4 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted text-sm font-medium hover:bg-ccb-muted/10">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* EDIT PRIZE DISTRIBUTION MODAL */}
        {prizeEditTournament && prizeForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-ccb-card rounded-xl border border-ccb-border max-w-md w-full max-h-[85vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold">Edit Prize Distribution</h3>
                <button onClick={() => setPrizeEditTournament(null)} className="text-ccb-muted hover:text-ccb-fg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-ccb-muted">Prize pool: {formatMWK(prizeEditTournament.prize_pool)}</p>
              <div>
                <label className="text-xs font-medium text-ccb-muted">Distribution Type</label>
                <select value={prizeForm.type || "percentage"} onChange={(e) => setPrizeForm({ ...prizeForm, type: e.target.value })} className="input-field mt-1 w-full">
                  <option value="percentage">Percentage of pool</option>
                  <option value="flat">Fixed amount per rank</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-ccb-muted">Payouts</label>
                {prizeForm.payouts?.map((payout: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-xs text-ccb-muted w-8">#{payout.rank}</span>
                    <input type="number" value={prizeForm.type === "flat" ? (payout.amount ?? 0) : payout.percentage ?? 0} onChange={(e) => updatePrizePayout(i, prizeForm.type === "flat" ? "amount" : "percentage", prizeForm.type === "flat" ? Number(e.target.value) : Number(e.target.value))} className="input-field flex-1" placeholder={prizeForm.type === "flat" ? "Amount (MK)" : "Percentage (%)"} />
                    {prizeForm.type === "percentage" && <span className="text-xs text-ccb-muted w-20 text-right">= {formatMWK(Math.floor(prizeEditTournament.prize_pool * (payout.percentage || 0) / 100))}</span>}
                    <button onClick={() => removePrizePayout(i)} className="text-ccb-danger hover:bg-ccb-danger/10 p-1 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button onClick={addPrizePayout} className="flex items-center gap-1 text-xs text-ccb-primary hover:underline">
                  <ChevronRight className="w-3.5 h-3.5" /> Add payout
                </button>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={savePrizeEdit} disabled={actionLoading === `${prizeEditTournament.id}_edit_prizes`} className="flex items-center gap-1 px-4 py-2 rounded-lg bg-ccb-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50">
                  {actionLoading === `${prizeEditTournament.id}_edit_prizes` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Prizes
                </button>
                <button onClick={() => setPrizeEditTournament(null)} className="px-4 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted text-sm font-medium hover:bg-ccb-muted/10">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MATCH RESULT OVERRIDE MODAL */}
        {overridePair && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !overrideLoading && setOverridePair(null)}>
            <div className="bg-ccb-card rounded-xl border border-ccb-border max-w-sm w-full p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-1.5">
                  <Gavel className="w-4 h-4 text-ccb-accent" /> Override Match Result
                </h3>
                <button onClick={() => setOverridePair(null)} className="text-ccb-muted hover:text-ccb-fg">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-ccb-muted">
                Round {overrideRound}:{" "}
                <span className="font-bold text-ccb-text">{overridePair.whiteName || "White"}</span> vs{" "}
                <span className="font-bold text-ccb-text">{overridePair.blackName || "Black"}</span>
              </p>
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="text-[11px] text-amber-400">
                  Records the result into the tournament, updates player scores, and may complete the round. Cannot be undone.
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: "white" as const, label: `${overridePair.whiteName || "White"} wins` },
                  { key: "draw" as const, label: "Draw" },
                  { key: "black" as const, label: `${overridePair.blackName || "Black"} wins` },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setOverrideWinner(opt.key)}
                    className={`px-2 py-2 rounded-lg border text-[11px] font-medium transition-colors ${
                      overrideWinner === opt.key
                        ? "bg-ccb-primary text-white border-ccb-primary"
                        : "bg-ccb-surface border-ccb-border text-ccb-text hover:bg-ccb-muted/10"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {overrideError && (
                <div className="text-xs text-ccb-danger flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {overrideError}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={submitOverride}
                  disabled={!overrideWinner || overrideLoading}
                  className="flex items-center gap-1 px-4 py-2 rounded-lg bg-ccb-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {overrideLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                  Record Result
                </button>
                <button
                  onClick={() => setOverridePair(null)}
                  disabled={overrideLoading}
                  className="px-4 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted text-sm font-medium hover:bg-ccb-muted/10 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
