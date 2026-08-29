"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Crown, ChevronDown, ChevronRight, Users, Calendar, Trophy,
  Settings, Play, RotateCcw, Loader2, UserMinus, RefreshCw,
  ArrowRight, CheckCircle, XCircle, Clock, AlertTriangle, Save,
} from "lucide-react";

// ============================================================
// Types
// ============================================================
type League = {
  id: string;
  name: string;
  tier: number;
  status: string;
  entry_type: string;
  prize_pool: number;
  league_size: number | null;
  promotes_count: number;
  relegates_count: number;
  qualifying_positions: number;
  current_matchday: number | null;
  total_matchdays: number | null;
  participant_count: number;
  player_ids: string[];
  min_rating: number;
  max_rating: number | null;
  gender_restriction: string;
  country: string;
  season_start_date: string | null;
};

type RosterPlayer = {
  registrationId: string;
  playerId: string;
  status: string;
  qualified: boolean;
  qualificationReason: string | null;
  registeredAt: string;
  isPlayer: boolean;
  player: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    country: string | null;
    rating: number;
    phone_verified: boolean;
    identity_verified: boolean;
  } | null;
};

type Fixture = {
  id: string;
  league_id: string;
  matchday: number;
  home_player_id: string;
  away_player_id: string;
  result: string;
  played: boolean;
  scheduled_date: string | null;
  home_player: { id: string; username: string | null; display_name: string | null; avatar_url: string | null; rating: number; country: string | null } | null;
  away_player: { id: string; username: string | null; display_name: string | null; avatar_url: string | null; rating: number; country: string | null } | null;
};

type Tab = "overview" | "roster" | "fixtures" | "settings";

// ============================================================
// Component
// ============================================================
export default function LeagueManager() {
  const [leagues, setLeagues] = useState<League[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Record<string, Tab>>({});
  const [loading, setLoading] = useState(true);
  const [roster, setRoster] = useState<RosterPlayer[] | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [fixtures, setFixtures] = useState<Fixture[] | null>(null);
  const [fixturesLoading, setFixturesLoading] = useState(false);
  const [editState, setEditState] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<{ leagueId: string; type: "success" | "error"; msg: string } | null>(null);

  const fetchLeagues = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/leagues");
      if (res.ok) {
        const data = await res.json();
        setLeagues(data);
        const edits: Record<string, any> = {};
        data.forEach((l: any) => {
          edits[l.id] = {
            prize_pool: l.prize_pool || 0,
            league_size: l.league_size,
            promotes_count: l.promotes_count,
            relegates_count: l.relegates_count,
            qualifying_positions: l.qualifying_positions,
            status: l.status,
          };
        });
        setEditState(edits);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchLeagues(); }, [fetchLeagues]);

  const expand = (id: string) => {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!activeTab[id]) setActiveTab((p) => ({ ...p, [id]: "overview" }));
    fetchRoster(id);
    fetchFixtures(id);
  };

  const fetchRoster = async (leagueId: string) => {
    setRosterLoading(true);
    try {
      const res = await fetch(`/api/admin/leagues/${leagueId}/players`);
      if (res.ok) {
        const data = await res.json();
        setRoster(data.roster || []);
      }
    } catch {}
    setRosterLoading(false);
  };

  const fetchFixtures = async (leagueId: string) => {
    setFixturesLoading(true);
    try {
      const res = await fetch(`/api/admin/leagues/${leagueId}/fixtures`);
      if (res.ok) {
        const data = await res.json();
        setFixtures(data.fixtures || []);
      }
    } catch {}
    setFixturesLoading(false);
  };

  const saveLeague = async (leagueId: string) => {
    setSaving(leagueId);
    setActionMsg(null);
    try {
      const res = await fetch(`/api/admin/leagues/${leagueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editState[leagueId]),
      });
      if (res.ok) {
        setActionMsg({ leagueId, type: "success", msg: "League updated" });
        await fetchLeagues();
        setTimeout(() => setActionMsg(null), 2500);
      } else {
        const err = await res.json();
        setActionMsg({ leagueId, type: "error", msg: err.error || "Failed to save" });
      }
    } catch (e: any) {
      setActionMsg({ leagueId, type: "error", msg: e.message });
    }
    setSaving(null);
  };

  const startLeague = async (leagueId: string) => {
    setSaving(leagueId);
    setActionMsg(null);
    try {
      // First save status as active
      const edit = { ...editState[leagueId], status: "active" };
      const res = await fetch(`/api/admin/leagues/${leagueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(edit),
      });
      if (res.ok) {
        // Then generate fixtures from the current player roster
        const league = leagues.find((l) => l.id === leagueId);
        const playerIds = league?.player_ids || [];
        if (playerIds.length < 2) {
          setActionMsg({ leagueId, type: "error", msg: "Need at least 2 players to start" });
          setSaving(null);
          return;
        }
        const fixRes = await fetch("/api/league/generate-fixtures", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            leagueId,
            playerIds,
            seasonStartDate: league?.season_start_date || "2026-09-05T10:00:00Z",
          }),
        });
        if (fixRes.ok) {
          const fixData = await fixRes.json();
          setActionMsg({ leagueId, type: "success", msg: `Started! ${fixData.totalMatchdays} matchdays, ${fixData.totalFixtures} fixtures generated.` });
          await fetchLeagues();
          fetchFixtures(leagueId);
        } else {
          const err = await fixRes.json();
          setActionMsg({ leagueId, type: "error", msg: err.error || "Failed to generate fixtures" });
        }
      }
      setTimeout(() => setActionMsg(null), 4000);
    } catch (e: any) {
      setActionMsg({ leagueId, type: "error", msg: e.message });
    }
    setSaving(null);
  };

  const advanceMatchday = async (leagueId: string) => {
    setSaving(leagueId);
    setActionMsg(null);
    try {
      const res = await fetch("/api/league/advance-matchday", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueId }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMsg({ leagueId, type: "success", msg: data.message || "Advanced to next matchday" });
        await fetchLeagues();
        fetchFixtures(leagueId);
      } else {
        setActionMsg({ leagueId, type: "error", msg: data.error || "Failed to advance" });
      }
      setTimeout(() => setActionMsg(null), 3000);
    } catch (e: any) {
      setActionMsg({ leagueId, type: "error", msg: e.message });
    }
    setSaving(null);
  };

  const removePlayer = async (leagueId: string, playerId: string) => {
    if (!confirm("Remove this player from the league?")) return;
    setSaving(leagueId);
    try {
      const res = await fetch(`/api/admin/leagues/${leagueId}/players`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, action: "remove" }),
      });
      if (res.ok) {
        setActionMsg({ leagueId, type: "success", msg: "Player removed" });
        await fetchLeagues();
        fetchRoster(leagueId);
        setTimeout(() => setActionMsg(null), 2000);
      }
    } catch {}
    setSaving(null);
  };

  const overrideResult = async (leagueId: string, fixtureId: string, result: string) => {
    try {
      const res = await fetch(`/api/admin/leagues/${leagueId}/fixtures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fixtureId, result }),
      });
      if (res.ok) {
        fetchFixtures(leagueId);
      }
    } catch {}
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "registration": return "bg-ccb-success/10 text-ccb-success";
      case "active": return "bg-ccb-primary/10 text-ccb-primary";
      case "completed": return "bg-ccb-muted/10 text-ccb-muted";
      case "upcoming": return "bg-amber-500/10 text-amber-500";
      default: return "bg-ccb-surface text-ccb-muted";
    }
  };

  const tierColor = (tier: number) => {
    if (tier <= 1) return "bg-ccb-primary/10 text-ccb-primary";
    if (tier <= 2) return "bg-ccb-accent/10 text-ccb-accent";
    if (tier <= 3) return "bg-amber-500/10 text-amber-500";
    return "bg-ccb-surface text-ccb-muted";
  };

  const playerName = (p: any) => p?.display_name || p?.username || (p?.id ? p.id.slice(0, 8) : "—");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-ccb-muted text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading leagues...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {leagues.length === 0 ? (
        <div className="text-center py-12 text-ccb-muted text-sm">
          <Crown className="w-8 h-8 mx-auto mb-2 opacity-50" />
          No leagues configured
        </div>
      ) : (
        leagues.map((league) => {
          const isOpen = expanded === league.id;
          const tab = activeTab[league.id] || "overview";
          const hasFixtures = fixtures && fixtures.length > 0;

          return (
            <div key={league.id} className="rounded-xl border border-ccb-border bg-ccb-card overflow-hidden">
              {/* Collapsed header — always visible */}
              <button
                onClick={() => expand(league.id)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-ccb-surface/50 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {isOpen ? <ChevronDown className="w-4 h-4 text-ccb-muted shrink-0" /> : <ChevronRight className="w-4 h-4 text-ccb-muted shrink-0" />}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${tierColor(league.tier)}`}>L{league.tier}</span>
                  <span className="font-bold text-sm truncate">{league.name}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${statusColor(league.status)}`}>{league.status}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-ccb-muted shrink-0">
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" />{league.participant_count}</span>
                  {league.current_matchday && league.total_matchdays && (
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />MD {league.current_matchday}/{league.total_matchdays}</span>
                  )}
                </div>
              </button>

              {/* Expanded body */}
              {isOpen && (
                <div className="border-t border-ccb-border">
                  {/* Tab bar */}
                  <div className="flex gap-1 px-3 pt-2 bg-ccb-surface/30">
                    {(["overview", "roster", "fixtures", "settings"] as Tab[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setActiveTab((p) => ({ ...p, [league.id]: t }))}
                        className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors ${
                          tab === t
                            ? "bg-ccb-card text-ccb-text border border-ccb-border border-b-transparent"
                            : "text-ccb-muted hover:text-ccb-text"
                        }`}
                      >
                        {t === "overview" && "Overview"}
                        {t === "roster" && `Roster (${league.participant_count})`}
                        {t === "fixtures" && "Fixtures"}
                        {t === "settings" && "Settings"}
                      </button>
                    ))}
                  </div>

                  {/* Tab content */}
                  <div className="p-4">
                    {actionMsg?.leagueId === league.id && (
                      <div className={`mb-3 px-3 py-2 rounded-lg text-xs font-medium ${
                        actionMsg.type === "success" ? "bg-ccb-success/10 text-ccb-success" : "bg-destructive/10 text-destructive"
                      }`}>
                        {actionMsg.msg}
                      </div>
                    )}

                    {/* OVERVIEW TAB */}
                    {tab === "overview" && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <StatBox label="Players" value={`${league.participant_count}`} icon={Users} />
                          <StatBox label="Matchday" value={league.current_matchday ? `${league.current_matchday}/${league.total_matchdays || "?"}` : "—"} icon={Calendar} />
                          <StatBox label="Promotes" value={`${league.promotes_count}`} icon={ArrowRight} />
                          <StatBox label="Relegates" value={`${league.relegates_count}`} icon={ArrowRight} />
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <StatBox label="Prize Pool" value={`MK ${(league.prize_pool || 0).toLocaleString()}`} icon={Trophy} />
                          <StatBox label="Entry" value={league.entry_type === "free" ? "Free" : league.entry_type} icon={Crown} />
                          <StatBox label="Qualifying" value={`${league.qualifying_positions} spots`} icon={Trophy} />
                        </div>

                        <div className="flex gap-2 pt-2">
                          {league.status === "registration" && (
                            <button
                              onClick={() => startLeague(league.id)}
                              disabled={saving === league.id}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ccb-success text-white text-xs font-bold hover:opacity-90 disabled:opacity-50"
                            >
                              {saving === league.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                              Start Season
                            </button>
                          )}
                          {league.status === "active" && (
                            <button
                              onClick={() => advanceMatchday(league.id)}
                              disabled={saving === league.id}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ccb-primary text-white text-xs font-bold hover:opacity-90 disabled:opacity-50"
                            >
                              {saving === league.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                              Advance Matchday
                            </button>
                          )}
                          <button
                            onClick={() => fetchLeagues()}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted text-xs font-medium hover:text-ccb-text"
                          >
                            <RefreshCw className="w-3.5 h-3.5" /> Refresh
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ROSTER TAB */}
                    {tab === "roster" && (
                      <div>
                        {rosterLoading ? (
                          <div className="flex items-center justify-center py-6 text-ccb-muted text-xs">
                            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading roster...
                          </div>
                        ) : roster && roster.length > 0 ? (
                          <div className="space-y-1 max-h-[400px] overflow-y-auto">
                            {roster
                              .filter((r) => r.status !== "removed")
                              .map((r, i) => (
                                <div key={r.registrationId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-ccb-surface/50">
                                  <span className="text-xs font-bold text-ccb-muted w-5 text-center">{i + 1}</span>
                                  {r.player?.avatar_url ? (
                                    <img src={r.player.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-7 h-7 rounded-full bg-ccb-primary/10 flex items-center justify-center text-[10px] font-bold text-ccb-primary">
                                      {playerName(r.player).slice(0, 2).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold truncate">{playerName(r.player)}</p>
                                    <p className="text-[10px] text-ccb-muted">
                                      Rating: {r.player?.rating || "—"}
                                      {r.player?.country ? ` · ${r.player.country}` : ""}
                                      {r.registeredAt ? ` · ${new Date(r.registeredAt).toLocaleDateString()}` : ""}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {r.isPlayer ? (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-ccb-success/10 text-ccb-success">IN</span>
                                    ) : r.status === "pending" ? (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500">PENDING</span>
                                    ) : (
                                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-ccb-surface text-ccb-muted">{r.status.toUpperCase()}</span>
                                    )}
                                    {r.player?.phone_verified && (
                                      <CheckCircle className="w-3 h-3 text-ccb-success" />
                                    )}
                                    {league.status !== "active" && (
                                      <button
                                        onClick={() => removePlayer(league.id, r.playerId)}
                                        className="text-ccb-muted hover:text-destructive transition-colors"
                                        title="Remove from league"
                                      >
                                        <UserMinus className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-ccb-muted text-xs">
                            <Users className="w-5 h-5 mx-auto mb-1 opacity-50" />
                            No registrations yet
                          </div>
                        )}
                      </div>
                    )}

                    {/* FIXTURES TAB */}
                    {tab === "fixtures" && (
                      <div>
                        {fixturesLoading ? (
                          <div className="flex items-center justify-center py-6 text-ccb-muted text-xs">
                            <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading fixtures...
                          </div>
                        ) : fixtures && fixtures.length > 0 ? (
                          <div className="space-y-3 max-h-[500px] overflow-y-auto">
                            {/* Group by matchday */}
                            {[...new Set(fixtures.map((f) => f.matchday))].sort((a, b) => a - b).map((md) => {
                              const mdFixtures = fixtures.filter((f) => f.matchday === md);
                              const allPlayed = mdFixtures.every((f) => f.played);
                              const somePlayed = mdFixtures.some((f) => f.played);
                              const isCurrent = league.current_matchday === md;
                              return (
                                <div key={md} className={`rounded-lg border ${isCurrent ? "border-ccb-primary/30 bg-ccb-primary/5" : "border-ccb-border"}`}>
                                  <div className="flex items-center justify-between px-3 py-1.5 bg-ccb-surface/50 rounded-t-lg">
                                    <span className="text-xs font-bold">Matchday {md}</span>
                                    <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${
                                      allPlayed ? "bg-ccb-success/10 text-ccb-success" :
                                      somePlayed ? "bg-amber-500/10 text-amber-500" :
                                      isCurrent ? "bg-ccb-primary/10 text-ccb-primary" :
                                      "bg-ccb-surface text-ccb-muted"
                                    }`}>
                                      {allPlayed ? "DONE" : somePlayed ? "LIVE" : isCurrent ? "CURRENT" : "UPCOMING"}
                                    </span>
                                  </div>
                                  <div className="divide-y divide-ccb-border">
                                    {mdFixtures.map((f) => (
                                      <div key={f.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                                        <div className="flex-1 flex items-center gap-2 min-w-0">
                                          <span className={`truncate ${f.result === "home_win" ? "font-bold text-ccb-success" : f.result === "away_win" ? "text-ccb-muted" : ""}`}>
                                            {playerName(f.home_player)}
                                          </span>
                                          <span className="text-ccb-muted shrink-0 text-[10px]">vs</span>
                                          <span className={`truncate ${f.result === "away_win" ? "font-bold text-ccb-success" : f.result === "home_win" ? "text-ccb-muted" : ""}`}>
                                            {playerName(f.away_player)}
                                          </span>
                                        </div>
                                        {f.played && (
                                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-ccb-surface text-ccb-muted shrink-0">
                                            {f.result === "home_win" ? "1-0" : f.result === "away_win" ? "0-1" : "½-½"}
                                          </span>
                                        )}
                                        {f.scheduled_date && (
                                          <span className="text-[9px] text-ccb-muted shrink-0 hidden sm:inline">
                                            {new Date(f.scheduled_date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
                                          </span>
                                        )}
                                        {/* Admin override dropdown */}
                                        <select
                                          value={f.result}
                                          onChange={(e) => overrideResult(league.id, f.id, e.target.value)}
                                          className="text-[10px] px-1.5 py-1 rounded border border-ccb-border bg-ccb-surface text-ccb-text shrink-0"
                                          title="Override result"
                                        >
                                          <option value="pending">—</option>
                                          <option value="home_win">Home Win</option>
                                          <option value="away_win">Away Win</option>
                                          <option value="draw">Draw</option>
                                        </select>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-6 text-ccb-muted text-xs">
                            <Calendar className="w-5 h-5 mx-auto mb-1 opacity-50" />
                            No fixtures generated yet. Start the season to generate round-robin fixtures.
                          </div>
                        )}
                      </div>
                    )}

                    {/* SETTINGS TAB */}
                    {tab === "settings" && (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          <ConfigField label="Prize Pool (MK)" value={editState[league.id]?.prize_pool ?? 0} onChange={(v) => setEditState((p) => ({ ...p, [league.id]: { ...p[league.id], prize_pool: Number(v) } }))} />
                          <ConfigField label="League Size" value={editState[league.id]?.league_size ?? ""} onChange={(v) => setEditState((p) => ({ ...p, [league.id]: { ...p[league.id], league_size: v } }))} />
                          <ConfigField label="Promotes" value={editState[league.id]?.promotes_count ?? 0} onChange={(v) => setEditState((p) => ({ ...p, [league.id]: { ...p[league.id], promotes_count: v } }))} />
                          <ConfigField label="Relegates" value={editState[league.id]?.relegates_count ?? 0} onChange={(v) => setEditState((p) => ({ ...p, [league.id]: { ...p[league.id], relegates_count: v } }))} />
                          <ConfigField label="Qualifying Positions" value={editState[league.id]?.qualifying_positions ?? 0} onChange={(v) => setEditState((p) => ({ ...p, [league.id]: { ...p[league.id], qualifying_positions: v } }))} />
                          <div>
                            <label className="text-xs text-ccb-muted mb-1 block">Status</label>
                            <select
                              value={editState[league.id]?.status ?? league.status}
                              onChange={(e) => setEditState((p) => ({ ...p, [league.id]: { ...p[league.id], status: e.target.value } }))}
                              className="w-full px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm"
                            >
                              <option value="upcoming">Upcoming</option>
                              <option value="registration">Registration</option>
                              <option value="active">Active</option>
                              <option value="completed">Completed</option>
                            </select>
                          </div>
                        </div>
                        <button
                          onClick={() => saveLeague(league.id)}
                          disabled={saving === league.id}
                          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-ccb-primary text-white text-xs font-bold hover:opacity-90 disabled:opacity-50"
                        >
                          {saving === league.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                          Save Settings
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

// ============================================================
// Sub-components
// ============================================================
function StatBox({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-lg bg-ccb-surface/50 border border-ccb-border p-2.5">
      <div className="flex items-center gap-1 mb-1">
        <Icon className="w-3 h-3 text-ccb-muted" />
        <span className="text-[10px] text-ccb-muted uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-sm font-bold">{value}</p>
    </div>
  );
}

function ConfigField({ label, value, onChange }: { label: string; value: any; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs text-ccb-muted mb-1 block">{label}</label>
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm"
      />
    </div>
  );
}
