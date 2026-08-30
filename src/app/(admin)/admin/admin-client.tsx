"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  LayoutDashboard, Users, ArrowDownUp, Trophy, Loader2, Check, X, Coins, Smartphone, Shield, Clock,
  TrendingUp, Wallet, AlertCircle, ChevronRight, Gamepad2,
  Ban, Star, DollarSign, Search, Save, ScrollText, Swords,
  ShieldCheck, UserRound, XCircle,
  Menu, LogOut, Crown, Play,
  Copy, Trash2, Edit3, Share2, Gift, Calendar,
  Settings, FileText, SlidersHorizontal, Database, ChevronDown,
} from "lucide-react";
import PlatformSettingsPanel from "./platform-settings-panel";
import LeagueManager from "./league-manager";
import UserDetailModal from "./user-detail-modal";

interface Withdrawal {
  id: string;
  amount: number;
  phone: string;
  operator_name: string;
  status: string;
  admin_notes: string | null;
  created_at: string;
  user_id: string;
  profiles: { username: string; display_name: string; email: string } | null;
}

interface Stats {
  totalUsers: number;
  gamesToday: number;
  totalGames?: number;
  activeTournaments: number;
  pendingWithdrawals: number;
  pendingDeposits: number;
  pendingTournamentApprovals?: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalPrizePools: number;
  walletLiquidity: number;
  totalBattleVolume?: number;
  platformRevenue?: number;
}

interface UserInfo {
  id: string;
  username: string;
  display_name: string;
  email: string;
  rating: number;
  games_played: number;
  wins: number;
  losses: number;
  draws: number;
  wallet_balance: number;
  is_admin: boolean;
  is_banned: boolean;
  phone: string | null;
  created_at: string;
}

interface Deposit {
  id: string;
  user_id: string;
  amount: number;
  status: string;
  method: string;
  charge_id: string | null;
  tx_ref: string | null;
  phone: string | null;
  operator: string | null;
  reference: string | null;
  created_at: string;
  admin_notes?: string | null;
  credited_by?: string | null;
  paychangu_ref?: string | null;
  profiles?: { username: string; display_name: string; email: string } | null;
}

interface Tournament {
  id: string;
  name: string;
  description: string | null;
  type: string;
  status: string;
  time_control: string;
  initial_minutes: number;
  increment_seconds: number;
  entry_fee: number;
  prize_pool: number;
  pool_source: string | null;
  creator_profit_percent: number | null;
  prize_distribution: any;
  max_players: number | null;
  min_rating: number;
  max_rating: number | null;
  current_round: number;
  rounds: number | null;
  duration_minutes: number | null;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  participant_count: number;
  paid_count?: number;
  revenue?: number;
}

interface GameInfo {
  id: string;
  status: string;
  time_control: string;
  rated: boolean;
  white_username: string;
  black_username: string;
  white_rating: number;
  black_rating: number;
  winner: string | null;
  created_at: string;
  move_count: number;
}

interface AdminLog {
  id: string;
  admin_id: string;
  action: string;
  target_type: string;
  target_id: string;
  details: any;
  created_at: string;
  profiles: { username: string; display_name: string } | null;
}

type Tab = "overview" | "users" | "withdrawals" | "tournaments" | "games" | "deposits" | "battles" | "logs" | "leagues" | "seasons" | "membership" | "verification" | "settings";

// Convert datetime-local (user's local TZ) to UTC ISO string for API
function localToUTC(localValue: string): string {
  if (!localValue) return localValue;
  return new Date(localValue).toISOString();
}

// Convert UTC ISO string to datetime-local format for the input (user's local TZ)
function utcToLocalInput(utcValue: string): string {
  if (!utcValue) return "";
  const d = new Date(utcValue);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function AdminDashboard({ adminName }: { adminName: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [games, setGames] = useState<GameInfo[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [adminLeagues, setAdminLeagues] = useState<any[]>([]);
  const [marketConfigs, setMarketConfigs] = useState<any[]>([]);
  const [marketEdits, setMarketEdits] = useState<Record<string, any>>({});
  const [adminSeasons, setAdminSeasons] = useState<any[]>([]);
  const [leagueEdits, setLeagueEdits] = useState<Record<string, any>>({});
  const [newSeason, setNewSeason] = useState({ name: "", country: "MW", start_date: "", end_date: "" });
  const [withdrawalFilter, setWithdrawalFilter] = useState("pending");
  const [depositFilter, setDepositFilter] = useState("all");
  const [gamesFilter, setGamesFilter] = useState("all");
  const [battleStats, setBattleStats] = useState<any>(null);
  const [battleConfig, setBattleConfig] = useState<any>(null);
  const [battleConfigSaving, setBattleConfigSaving] = useState(false);
  const [withdrawalConfig, setWithdrawalConfig] = useState<any>(null);
  const [withdrawalConfigSaving, setWithdrawalConfigSaving] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(null);
  const [userDetailId, setUserDetailId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [prizeEditTournament, setPrizeEditTournament] = useState<Tournament | null>(null);
  const [prizeForm, setPrizeForm] = useState<any>(null);
  const [creatingTournament, setCreatingTournament] = useState(false);
  const [createForm, setCreateForm] = useState<Record<string, any>>({});
  const [tournamentFilter, setTournamentFilter] = useState<string>("all");
  const [tournamentSearch, setTournamentSearch] = useState("");
  const [managingTournament, setManagingTournament] = useState<Tournament | null>(null);
  const [tournamentDetail, setTournamentDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [verificationPlayers, setVerificationPlayers] = useState<any[]>([]);
  const [verificationLoading, setVerificationLoading] = useState(false);
  const [verificationFilter, setVerificationFilter] = useState<"pending" | "verified" | "all">("pending");
  // Finance config
  const [financeConfigSaving, setFinanceConfigSaving] = useState(false);
  const [depositSearch, setDepositSearch] = useState("");
  const [withdrawalSearch, setWithdrawalSearch] = useState("");
  const [rejectReason, setRejectReason] = useState<string>("");
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [creditingId, setCreditingId] = useState<string | null>(null);
  const [creditNotes, setCreditNotes] = useState<string>("");
  const [configEdit, setConfigEdit] = useState<Record<string, string>>({});

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchStats = useCallback(async () => {
    const res = await fetch("/api/admin/stats");
    const data = await res.json();
    setStats(data);
  }, []);

  const fetchWithdrawals = useCallback(async () => {
    const res = await fetch(`/api/admin/withdrawals?status=${withdrawalFilter}`);
    const data = await res.json();
    setWithdrawals(data.withdrawals || []);
  }, [withdrawalFilter]);

  const fetchUsers = useCallback(async () => {
    const res = await fetch("/api/admin/users");
    const data = await res.json();
    setUsers(data.users || []);
  }, []);

  const fetchDeposits = useCallback(async () => {
    const res = await fetch(`/api/admin/deposits?status=${depositFilter}`);
    const data = await res.json();
    setDeposits(data.deposits || []);
  }, [depositFilter]);

  const fetchTournaments = useCallback(async () => {
    const res = await fetch("/api/admin/tournaments");
    const data = await res.json();
    setTournaments(data.tournaments || []);
  }, []);

  const fetchGames = useCallback(async () => {
    const res = await fetch(`/api/admin/games?status=${gamesFilter}`);
    const data = await res.json();
    setGames(data.games || []);
  }, [gamesFilter]);

  const fetchLogs = useCallback(async () => {
    const res = await fetch("/api/admin/logs");
    const data = await res.json();
    setLogs(data.logs || []);
  }, []);


  const fetchWithdrawalConfig = useCallback(async () => {
    const res = await fetch("/api/admin/withdrawal-config");
    if (res.ok) setWithdrawalConfig(await res.json());
  }, []);

  const fetchBattleStats = useCallback(async () => {
    const [statsRes, configRes] = await Promise.all([
      fetch("/api/battles/stats"),
      fetch("/api/admin/battle-config"),
    ]);
    if (statsRes.ok) setBattleStats(await statsRes.json());
    if (configRes.ok) setBattleConfig(await configRes.json());
  }, []);

  const fetchVerificationPlayers = useCallback(async () => {
    setVerificationLoading(true);
    try {
      const res = await fetch(`/api/admin/identity-verification?filter=${verificationFilter}`);
      const json = await res.json();
      setVerificationPlayers(json.players || []);
    } catch { setVerificationPlayers([]); }
    finally { setVerificationLoading(false); }
  }, [verificationFilter]);

  const verifyIdentity = async (playerId: string, action: "verify" | "reject", genderOverride?: string) => {
    setActionLoading(`${playerId}_verify`);
    try {
      const res = await fetch("/api/admin/identity-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, action, genderOverride }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      showToast(json.message || "Done");
      await fetchVerificationPlayers();
    } catch (err: any) { showToast(err.message); }
    finally { setActionLoading(null); }
  };

  const fetchAdminLeagues = useCallback(async () => {
    const res = await fetch("/api/admin/leagues");
    if (res.ok) {
      const data = await res.json();
      setAdminLeagues(data);
      const edits: Record<string, any> = {};
      data.forEach((l: any) => {
        edits[l.id] = { prize_pool: l.prize_pool, league_size: l.league_size, promotes_count: l.promotes_count, relegates_count: l.relegates_count, qualifying_positions: l.qualifying_positions, status: l.status };
      });
      setLeagueEdits(edits);
    }
  }, []);

  const fetchAdminSeasons = useCallback(async () => {
    const res = await fetch("/api/admin/seasons");
    if (res.ok) setAdminSeasons(await res.json());
  }, []);

  const saveLeague = async (leagueId: string) => {
    setActionLoading(leagueId);
    try {
      const res = await fetch(`/api/admin/leagues/${leagueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(leagueEdits[leagueId]),
      });
      if (res.ok) {
        showToast("League updated");
        await fetchAdminLeagues();
      }
    } catch {} finally { setActionLoading(null); }
  };

  const createSeason = async () => {
    setActionLoading("new-season");
    try {
      const res = await fetch("/api/admin/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newSeason),
      });
      if (res.ok) {
        showToast("Season created");
        setNewSeason({ name: "", country: "MW", start_date: "", end_date: "" });
        await fetchAdminSeasons();
      }
    } catch {} finally { setActionLoading(null); }
  };

  const updateSeason = async (seasonId: string, status: string) => {
    setActionLoading(seasonId);
    try {
      const res = await fetch(`/api/admin/seasons/${seasonId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        showToast(`Season ${status === "active" ? "activated" : "completed"}`);
        await fetchAdminSeasons();
      }
    } catch {} finally { setActionLoading(null); }
  };
  const fetchMarketConfigs = useCallback(async () => {
    const res = await fetch("/api/admin/market-config");
    if (res.ok) {
      const data = await res.json();
      setMarketConfigs(data);
      const edits: Record<string, any> = {};
      data.forEach((c: any) => {
        edits[c.country_code] = { membership_price: c.membership_price, membership_currency: c.membership_currency, membership_active: c.membership_active };
      });
      setMarketEdits(edits);
    }
  }, []);

  const saveMarketConfig = async (countryCode: string) => {
    setActionLoading(countryCode);
    try {
      const res = await fetch("/api/admin/market-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country_code: countryCode, ...marketEdits[countryCode] }),
      });
      if (res.ok) {
        showToast("Membership pricing updated");
        await fetchMarketConfigs();
      }
    } catch {} finally { setActionLoading(null); }
  };
  useEffect(() => {
    if (tab === "verification") fetchVerificationPlayers();
  }, [verificationFilter]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchStats();
      if (tab === "withdrawals") { await fetchWithdrawals(); await fetchWithdrawalConfig(); }
      if (tab === "users") await fetchUsers();
      if (tab === "deposits") await fetchDeposits();
      if (tab === "tournaments") await fetchTournaments();
      if (tab === "games") await fetchGames();
      if (tab === "logs") await fetchLogs();
      if (tab === "battles") await fetchBattleStats();
      
      if (tab === "leagues") await fetchAdminLeagues();
      if (tab === "seasons") await fetchAdminSeasons();
      if (tab === "membership") await fetchMarketConfigs();
      if (tab === "verification") await fetchVerificationPlayers();
      setLoading(false);
    };
    load();
  }, [tab, withdrawalFilter, depositFilter, gamesFilter]);

  const handleApprove = async (id: string) => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/withdrawals/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to approve");
      setWithdrawals((prev) => prev.filter((w) => w.id !== id));
      await fetchStats();
      showToast("Withdrawal approved");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (id: string) => {
    const notes = prompt("Reason for rejection (optional):") || "Rejected by admin";
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/withdrawals/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reject");
      setWithdrawals((prev) => prev.filter((w) => w.id !== id));
      await fetchStats();
      showToast("Withdrawal rejected");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleAutoApprove = async (enabled: boolean) => {
    setWithdrawalConfigSaving(true);
    try {
      const res = await fetch("/api/admin/withdrawal-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: withdrawalConfig?.id,
          auto_approve_enabled: enabled,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setWithdrawalConfig(data);
        showToast(enabled ? "Auto-approval enabled — withdrawals will process automatically" : "Manual approval enabled — withdrawals require admin review");
      } else {
        showToast(data.error || "Failed to update setting");
      }
    } catch {
      showToast("Failed to update setting");
    } finally {
      setWithdrawalConfigSaving(false);
    }
  };

  // Save full finance config (min amounts, fees, limits)
  const handleSaveFinanceConfig = async (updates: Record<string, any>) => {
    setFinanceConfigSaving(true);
    try {
      const res = await fetch("/api/admin/withdrawal-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...updates, id: withdrawalConfig?.id }),
      });
      if (res.ok) {
        setWithdrawalConfig(await res.json());
        setConfigEdit({});
        showToast("Finance settings updated");
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to update settings");
      }
    } catch {
      showToast("Failed to update finance settings");
    }
    setFinanceConfigSaving(false);
  };

  // Reject withdrawal with reason
  const handleRejectWithReason = async (id: string) => {
    if (!rejectReason.trim()) {
      showToast("Please provide a reason for rejection");
      return;
    }
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/withdrawals/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: rejectReason }),
      });
      if (res.ok) {
        showToast("Withdrawal rejected & refunded");
        setWithdrawals(prev => prev.map(w => w.id === id ? { ...w, status: "rejected", admin_notes: rejectReason } : w));
        setRejectingId(null);
        setRejectReason("");
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to reject");
      }
    } catch {
      showToast("Failed to reject withdrawal");
    }
    setActionLoading(null);
  };

  // Credit deposit with notes
  const handleCreditWithNotes = async (id: string) => {
    if (!creditNotes.trim()) {
      showToast("Please add a note for the manual credit");
      return;
    }
    setActionLoading(`${id}_credit`);
    try {
      const res = await fetch(`/api/admin/deposits/${id}/credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: creditNotes }),
      });
      if (res.ok) {
        showToast("Deposit credited successfully");
        setDeposits(prev => prev.map(d => d.id === id ? { ...d, status: "success", admin_notes: creditNotes } : d));
        setCreditingId(null);
        setCreditNotes("");
      } else {
        const data = await res.json();
        showToast(data.error || "Failed to credit deposit");
      }
    } catch {
      showToast("Failed to credit deposit");
    }
    setActionLoading(null);
  };

  const handleVerifyDeposit = async (id: string) => {
    setActionLoading(`${id}_verify`);
    try {
      const res = await fetch(`/api/admin/deposits/${id}/verify`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      if (data.status === "success") {
        showToast(data.message || "Deposit verified and credited");
        await fetchDeposits();
        await fetchStats();
      } else if (data.status === "failed") {
        showToast(data.message || "Payment not completed");
        await fetchDeposits();
      } else {
        showToast(`Status: ${data.status} - ${data.message || "Still pending"}`);
      }
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreditDeposit = async (id: string) => {
    if (!confirm("Manually credit this deposit? This will add funds to the user's wallet.")) return;
    setActionLoading(`${id}_credit`);
    try {
      const res = await fetch(`/api/admin/deposits/${id}/credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Manual credit by admin" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to credit");
      showToast("Deposit credited to wallet");
      await fetchDeposits();
      await fetchStats();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectDeposit = async (id: string) => {
    const notes = prompt("Reason for rejecting this deposit (optional):") || "Rejected by admin";
    setActionLoading(`${id}_reject`);
    try {
      const res = await fetch(`/api/admin/deposits/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reject");
      showToast("Deposit rejected");
      await fetchDeposits();
      await fetchStats();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUserAction = async (userId: string, action: string, value?: any) => {
    setActionLoading(`${userId}_${action}`);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action, value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await fetchUsers();
      if (selectedUser?.id === userId) {
        // Update selected user
        const updated = users.find(u => u.id === userId);
        if (updated) setSelectedUser({ ...updated, ...value === true ? { is_admin: true } : {} });
      }
      showToast(`User ${action} successful`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };



  const handleDeleteUser = async (userId: string, username: string) => {
    const msg1 = "PERMANENTLY DELETE " + username + "?\n\nThis will remove ALL their data:\n- Profile, auth account, game history\n- Tournament participations\n- Battle records\n- Referrals, deposits, withdrawals\n\nThis CANNOT be undone. Are you absolutely sure?";
    if (!confirm(msg1)) return;
    const msg2 = "Last chance \u2014 really delete " + username + "? This is irreversible.";
    if (!confirm(msg2)) return;
    setActionLoading(userId + "_delete");
    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await fetchUsers();
      showToast(data.warning ? "User deleted (partial: " + data.warning + ")" : "User permanently deleted");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleTournamentAction = async (tournamentId: string, action: string) => {
    if (!confirm(`Are you sure you want to ${action} this tournament?`)) return;
    setActionLoading(`${tournamentId}_${action}`);
    try {
      const res = await fetch("/api/admin/tournaments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await fetchTournaments();
      showToast(`Tournament ${action} successful`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleTournamentEdit = (t: Tournament) => {
    setEditingTournament(t);
    setEditForm({
      name: t.name,
      description: t.description || "",
      type: t.type,
      time_control: t.time_control,
      initial_minutes: t.initial_minutes,
      increment_seconds: t.increment_seconds,
      max_players: t.max_players || "",
      min_rating: t.min_rating || 0,
      max_rating: t.max_rating || "",
      rounds: t.rounds || "",
      duration_minutes: t.duration_minutes || "",
      starts_at: t.starts_at ? utcToLocalInput(t.starts_at) : "",
      ends_at: t.ends_at ? utcToLocalInput(t.ends_at) : "",
      entry_fee: t.entry_fee || 0,
      prize_pool: t.prize_pool || 0,
      pool_source: t.pool_source || 'entry_fees',
      creator_profit_percent: t.creator_profit_percent || 0,
    });
  };

  const saveTournamentEdit = async () => {
    if (!editingTournament) return;
    setActionLoading(`${editingTournament.id}_edit`);
    try {
      const body: Record<string, any> = { tournamentId: editingTournament.id, action: "edit" };
      for (const [k, v] of Object.entries(editForm)) {
        if (v !== "" && v !== null) {
          if (k === "starts_at" || k === "ends_at") {
            body[k] = v ? localToUTC(v as string) : null;
          } else if (k === "entry_fee" || k === "prize_pool" || k === "creator_profit_percent") {
            body[k] = v === "" ? null : Number(v);
          } else {
            body[k] = v === "" ? null : v;
          }
        }
      }
      const res = await fetch("/api/admin/tournaments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setEditingTournament(null);
      await fetchTournaments();
      showToast("Tournament updated");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleTournamentDelete = async (tournamentId: string) => {
    if (!confirm("Permanently delete this tournament and all associated data (games, rounds, participants)? For upcoming/active tournaments, paid entry fees will be refunded. For finished tournaments, data is removed but no refunds are issued (prizes already distributed). This cannot be undone.")) return;
    setActionLoading(`${tournamentId}_delete`);
    try {
      const res = await fetch(`/api/admin/tournaments?id=${tournamentId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await fetchTournaments();
      showToast("Tournament deleted");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleTournamentDuplicate = async (tournamentId: string) => {
    setActionLoading(`${tournamentId}_duplicate`);
    try {
      const res = await fetch("/api/admin/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await fetchTournaments();
      showToast(`Duplicated as "${data.clone?.name}"`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleTournamentShare = async (t: Tournament) => {
    const url = `${window.location.origin}/league`;
    try {
      await navigator.clipboard.writeText(url);
      showToast(`Invite link copied: ${url}`);
    } catch {
      // Fallback for older browsers
      prompt("Copy this invite link:", url);
    }
  };

  const handlePrizeEdit = (t: Tournament) => {
    setPrizeEditTournament(t);
    const dist = t.prize_distribution || { type: "percentage", payouts: [] };
    setPrizeForm(JSON.parse(JSON.stringify(dist)));
  };

  const savePrizeEdit = async () => {
    if (!prizeEditTournament) return;
    setActionLoading(`${prizeEditTournament.id}_edit_prizes`);
    try {
      const res = await fetch("/api/admin/tournaments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: prizeEditTournament.id,
          action: "edit_prizes",
          prize_distribution: prizeForm,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setPrizeEditTournament(null);
      await fetchTournaments();
      showToast("Prize distribution updated");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateTournament = async () => {
    setActionLoading("create_tournament");
    try {
      const res = await fetch("/api/tournaments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name,
          description: createForm.description || "",
          type: createForm.type || "swiss",
          timeControl: createForm.time_control || "rapid",
          initialMinutes: Number(createForm.initial_minutes) || 10,
          incrementSeconds: Number(createForm.increment_seconds) || 5,
          maxPlayers: createForm.max_players ? Number(createForm.max_players) : null,
          minPlayers: Number(createForm.min_players) || 2,
          rounds: createForm.rounds ? Number(createForm.rounds) : null,
          durationMinutes: createForm.duration_minutes ? Number(createForm.duration_minutes) : null,
          startsAt: localToUTC(createForm.starts_at),
          endsAt: createForm.ends_at ? localToUTC(createForm.ends_at) : null,
          entryFee: (Number(createForm.entry_fee) || 0),
          creatorProfitPercent: Number(createForm.creator_profit_percent) || 0,
          prizePool: (Number(createForm.prize_pool) || 0),
          poolSource: createForm.pool_source || 'entry_fees',
          minRating: Number(createForm.min_rating) || 0,
          maxRating: createForm.max_rating ? Number(createForm.max_rating) : null,
          thumbnailDataUrl: createForm.thumbnail_data_url || null,
          knockoutFormat: createForm.knockout_format || "pure",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create tournament");
      setCreatingTournament(false);
      setCreateForm({});
      await fetchTournaments();
      showToast(`Tournament "${data.tournament?.name || "New tournament"}" created`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const fetchTournamentDetail = async (t: Tournament) => {
    setManagingTournament(t);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/tournaments/${t.id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setTournamentDetail(data);
    } catch (err: any) {
      setTournamentDetail({ error: err.message });
    } finally {
      setDetailLoading(false);
    }
  };

  const handleAdminTournamentAction = async (action: string) => {
    if (!managingTournament) return;
    if (!confirm(`Are you sure you want to ${action.replace(/_/g, " ")} this tournament?`)) return;
    setActionLoading(`admin_${action}`);
    try {
      const res = await fetch(`/api/admin/tournaments/${managingTournament.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      showToast(`Tournament ${action.replace(/_/g, " ")} successful`);
      await fetchTournaments();
      await fetchTournamentDetail(managingTournament);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredTournaments = tournaments.filter((t) => {
    const matchFilter = tournamentFilter === "all" || t.status === tournamentFilter;
    const q = tournamentSearch.toLowerCase();
    const matchSearch = !q || t.name.toLowerCase().includes(q) || (t.description || "").toLowerCase().includes(q);
    return matchFilter && matchSearch;
  });

  const tournamentStats = {
    total: tournaments.length,
    upcoming: tournaments.filter((t) => t.status === "upcoming").length,
    active: tournaments.filter((t) => t.status === "active").length,
    finished: tournaments.filter((t) => t.status === "finished" || t.status === "completed").length,
    pending: tournaments.filter((t) => t.status === "pending_approval").length,
    cancelled: tournaments.filter((t) => t.status === "cancelled").length,
  };

  const updatePrizePayout = (index: number, field: string, value: any) => {
    const updated = { ...prizeForm };
    updated.payouts = [...updated.payouts];
    updated.payouts[index] = { ...updated.payouts[index], [field]: value };
    setPrizeForm(updated);
  };

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

  const handleGameAbort = async (gameId: string) => {
    if (!confirm("Abort this game? This cannot be undone.")) return;
    setActionLoading(gameId);
    try {
      const res = await fetch("/api/admin/games", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, action: "abort" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await fetchGames();
      showToast("Game aborted");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  const saveBattleConfig = async () => {
    setBattleConfigSaving(true);
    try {
      let stakeLevels = battleConfig?.stake_levels;
      if (typeof stakeLevels === "string") {
        stakeLevels = stakeLevels
          .split(",")
          .map((s: string) => parseInt(s.trim(), 10))
          .filter((n: number) => !isNaN(n));
      }
      const payload = {
        ...battleConfig,
        stake_levels: stakeLevels,
      };
      const res = await fetch("/api/admin/battle-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setBattleConfig(data);
      showToast("Battle config saved");
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBattleConfigSaving(false);
    }
  };

  const formatMWK = (amount: number) => `MWK ${Math.floor((amount || 0)).toLocaleString()}`;
  const formatDate = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  const filteredUsers = users.filter((u) => {
    const q = userSearch.toLowerCase();
    return !q || u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q) || u.display_name?.toLowerCase().includes(q);
  });

  const tabs: { id: Tab; label: string; icon: any; badge?: number }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "users", label: "Users", icon: Users },
    { id: "withdrawals", label: "Withdrawals", icon: ArrowDownUp, badge: stats?.pendingWithdrawals },
    { id: "tournaments", label: "Tournaments", icon: Trophy, badge: stats?.pendingTournamentApprovals || undefined },
    { id: "games", label: "Games", icon: Gamepad2 },
    { id: "deposits", label: "Deposits", icon: DollarSign, badge: stats?.pendingDeposits || undefined },
    { id: "battles", label: "Battles", icon: Swords },
    { id: "logs", label: "Logs", icon: ScrollText },
    { id: "leagues", label: "Leagues", icon: Crown },
    { id: "seasons", label: "Seasons", icon: Calendar },
    { id: "membership", label: "Membership", icon: Crown },
    { id: "verification", label: "Verification", icon: ShieldCheck },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex min-h-screen">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-[60] bg-ccb-success text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2">
          <Check className="w-4 h-4" /> {toast}
        </div>
      )}

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 sm:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed sm:sticky top-0 left-0 z-40 h-screen w-64 bg-ccb-dark border-r border-ccb-border flex flex-col transition-transform duration-200 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full sm:translate-x-0"
        }`}
      >
        {/* Sidebar header */}
        <div className="px-4 py-4 border-b border-ccb-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-ccb-primary to-ccb-primary/70 flex items-center justify-center shadow-lg">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">Admin Console</p>
              <p className="text-[10px] text-ccb-muted">Crazy Chess Battles</p>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="sm:hidden p-1.5 rounded-lg text-ccb-muted hover:bg-ccb-surface"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Nav items — grouped */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-3">
          {[
            { label: null, items: ["overview"] },
            { label: "Financial", items: ["deposits", "withdrawals", "battles"] },
            { label: "Compete", items: ["tournaments", "games", "leagues", "seasons"] },
            { label: "Community", items: ["users", "membership", "verification"] },
            { label: "System", items: ["logs", "settings"] },
          ].map((group, gi) => {
            const groupTabs = group.items
              .map(id => tabs.find(t => t.id === id))
              .filter(Boolean);
            if (groupTabs.length === 0) return null;
            return (
              <div key={gi} className="space-y-0.5">
                {group.label && (
                  <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-ccb-muted/60 font-bold">
                    {group.label}
                  </div>
                )}
                {groupTabs.map((t: any) => {
                  const Icon = t.icon;
                  const isActive = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setTab(t.id); setWithdrawalFilter("pending"); setDepositFilter("all"); setGamesFilter("all"); setSidebarOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isActive
                          ? "bg-ccb-primary/15 text-ccb-primary shadow-sm"
                          : "text-ccb-muted hover:text-ccb-text hover:bg-ccb-surface"
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="flex-1 text-left">{t.label}</span>
                      {t.badge ? (
                        <span className="px-1.5 py-0.5 rounded-full bg-ccb-accent/20 text-ccb-accent text-[10px] font-bold">
                          {t.badge}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Sidebar footer */}
        <div className="px-3 py-3 border-t border-ccb-border space-y-1">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-ccb-surface/50">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-ccb-primary/30 to-ccb-primary/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-ccb-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{adminName}</p>
              <p className="text-[10px] text-ccb-muted">Administrator</p>
            </div>
          </div>
          <a
            href="/dashboard"
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-ccb-muted hover:text-ccb-text hover:bg-ccb-surface transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Exit to app
          </a>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile header */}
        <div className="sm:hidden flex items-center justify-between px-4 py-3 border-b border-ccb-border bg-ccb-dark sticky top-0 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="flex items-center gap-2 text-ccb-text"
          >
            <Menu className="w-5 h-5" />
            <span className="text-sm font-bold">Admin</span>
          </button>
          <div className="flex items-center gap-1.5">
            <Shield className="w-4 h-4 text-ccb-primary" />
            <span className="text-xs text-ccb-muted">{tabs.find(t => t.id === tab)?.label}</span>
          </div>
        </div>

        {/* Desktop header */}
        <div className="hidden sm:flex items-center justify-between px-6 py-4 border-b border-ccb-border">
          <div>
            <h1 className="text-lg font-bold flex items-center gap-2">
              {(() => {
                const Icon = tabs.find(t => t.id === tab)?.icon || Shield;
                return <Icon className="w-5 h-5 text-ccb-primary" />;
              })()}
              {tabs.find(t => t.id === tab)?.label || "Overview"}
            </h1>
            <p className="text-xs text-ccb-muted mt-0.5">Welcome back, {adminName}</p>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 p-4 sm:p-6 space-y-4 overflow-y-auto">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-ccb-muted" />
        </div>
      ) : (
        <>
          {/* OVERVIEW */}
          {tab === "overview" && stats && (
            <div className="space-y-4">
              <PlatformSettingsPanel section="overview" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
                <StatCard icon={Users} label="Total Users" value={stats.totalUsers || 0} color="text-ccb-primary" />
                <StatCard icon={Trophy} label="Active Tournaments" value={stats.activeTournaments || 0} color="text-ccb-accent" />
                <StatCard icon={TrendingUp} label="Games Today" value={stats.gamesToday || 0} color="text-ccb-success" />
                <StatCard icon={AlertCircle} label="Pending Withdrawals" value={stats.pendingWithdrawals || 0} color="text-ccb-danger" />
                <StatCard icon={Gamepad2} label="Total Games" value={stats.totalGames || 0} color="text-ccb-primary" />
                <StatCard icon={Trophy} label="Pending Approvals" value={stats.pendingTournamentApprovals || 0} color="text-amber-500" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-4">
                <StatCard icon={DollarSign} label="Total Deposits" value={formatMWK(stats.totalDeposits)} color="text-ccb-success" />
                <StatCard icon={ArrowDownUp} label="Total Withdrawals" value={formatMWK(stats.totalWithdrawals)} color="text-ccb-accent" />
                <StatCard icon={Wallet} label="Wallet Liquidity" value={formatMWK(stats.walletLiquidity)} color="text-ccb-primary" />
                <StatCard icon={Swords} label="Battle Volume" value={formatMWK(stats.totalBattleVolume || 0)} color="text-ccb-accent" />
                <StatCard icon={Coins} label="Platform Revenue" value={formatMWK(stats.platformRevenue || 0)} color="text-ccb-success" />
              </div>

              <div className="card">
                <h3 className="font-medium text-sm text-ccb-muted uppercase tracking-wide mb-3">Platform Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ccb-muted">Total Tournament Prize Pools</span>
                    <span className="font-medium">{formatMWK(stats.totalPrizePools)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ccb-muted">Net Flow (Deposits - Withdrawals)</span>
                    <span className="font-medium text-ccb-success">{formatMWK(stats.totalDeposits - stats.totalWithdrawals)}</span>
                  </div>
                </div>
              </div>

              {stats.pendingWithdrawals > 0 && (
                <button
                  onClick={() => setTab("withdrawals")}
                  className="card w-full flex items-center justify-between p-4 border-ccb-accent/30 hover:border-ccb-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-ccb-accent" />
                    <span className="font-medium">{stats.pendingWithdrawals} pending withdrawal{stats.pendingWithdrawals !== 1 ? "s" : ""} need review</span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-ccb-muted" />
                </button>
              )}
            </div>
          )}

          {/* USERS */}
          {tab === "users" && (
            <div className="space-y-3">
              <PlatformSettingsPanel section="users" />
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ccb-muted" />
                <input
                  type="text"
                  placeholder="Search users by name, email..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm"
                />
              </div>

              {filteredUsers.length === 0 ? (
                <div className="text-center py-12 text-ccb-muted text-sm">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No users found
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredUsers.map((u) => (
                    <div key={u.id} className={`card ${u.is_banned ? "opacity-60" : ""} cursor-pointer hover:border-ccb-primary/30 transition-colors`} onClick={() => setUserDetailId(u.id)}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center">
                            <span className="text-sm font-bold text-ccb-primary">
                              {(u.display_name || u.username || "?").charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <div className="text-sm font-medium flex items-center gap-2">
                              {u.display_name || u.username}
                              {u.is_admin && <span className="text-xs px-1.5 py-0.5 rounded bg-ccb-primary/20 text-ccb-primary font-bold">ADMIN</span>}
                              {u.is_banned && <span className="text-xs px-1.5 py-0.5 rounded bg-ccb-danger/20 text-ccb-danger font-bold">BANNED</span>}
                            </div>
                            <div className="text-xs text-ccb-muted">{u.email} · {u.rating || "Unrated"} elo · {u.games_played || 0} games · W{u.wins || 0}/L{u.losses || 0}/D{u.draws || 0}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{formatMWK(u.wallet_balance)}</div>
                          <div className="text-xs text-ccb-muted flex items-center gap-1 justify-end">
                            
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-ccb-border">
                        <ActionButton
                          onClick={() => setUserDetailId(u.id)}
                          loading={false}
                          variant="primary"
                        >
                          <UserRound className="w-3.5 h-3.5" /> View Profile
                        </ActionButton>

                        <ActionButton
                          onClick={() => handleUserAction(u.id, u.is_banned ? "unban" : "ban")}
                          loading={actionLoading === `${u.id}_${u.is_banned ? "unban" : "ban"}`}
                          variant={u.is_banned ? "success" : "danger"}
                        >
                          <Ban className="w-3.5 h-3.5" /> {u.is_banned ? "Unban" : "Ban"}
                        </ActionButton>

                        <ActionButton
                          onClick={() => handleUserAction(u.id, "toggle_admin", !u.is_admin)}
                          loading={actionLoading === `${u.id}_toggle_admin`}
                          variant="primary"
                        >
                          <Shield className="w-3.5 h-3.5" /> {u.is_admin ? "Remove Admin" : "Make Admin"}
                        </ActionButton>

                        <ActionButton
                          onClick={() => {
                            const val = prompt("Adjust wallet (positive=credit, negative=debit, in MK):", "10");
                            if (val !== null) handleUserAction(u.id, "adjust_wallet", parseInt(val));
                          }}
                          loading={actionLoading === `${u.id}_adjust_wallet`}
                          variant="default"
                        >
                          <DollarSign className="w-3.5 h-3.5" /> Wallet
                        </ActionButton>

                        <ActionButton
                          onClick={() => {
                            const val = prompt("Set new rating (0-4000):", String(u.rating || 1500));
                            if (val !== null) handleUserAction(u.id, "adjust_rating", parseInt(val));
                          }}
                          loading={actionLoading === `${u.id}_adjust_rating`}
                          variant="default"
                        >
                          <Star className="w-3.5 h-3.5" /> Rating
                        </ActionButton>

                        <ActionButton
                          onClick={() => handleDeleteUser(u.id, u.display_name || u.username)}
                          loading={actionLoading === (u.id + "_delete")}
                          variant="danger"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </ActionButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* WITHDRAWALS */}
          {tab === "withdrawals" && (
            <div className="space-y-4">
              <PlatformSettingsPanel section="withdrawals" />
              {/* Finance Config Panel */}
              {withdrawalConfig && (
                <div className="card border-ccb-primary/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Settings className="w-4 h-4 text-ccb-primary" />
                    <h3 className="text-sm font-bold">Withdrawal & Deposit Settings</h3>
                  </div>

                  {/* Auto-approve toggle */}
                  <div className="flex items-center justify-between gap-3 py-2">
                    <div>
                      <p className="text-sm font-medium">Auto-Approve Withdrawals</p>
                      <p className="text-xs text-ccb-muted mt-0.5">
                        {withdrawalConfig.auto_approve_enabled
                          ? "Withdrawals process automatically via Paychangu."
                          : "Withdrawals require manual admin approval."}
                      </p>
                    </div>
                    <button
                      onClick={() => handleToggleAutoApprove(!withdrawalConfig.auto_approve_enabled)}
                      disabled={withdrawalConfigSaving}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                        withdrawalConfig.auto_approve_enabled ? "bg-ccb-success" : "bg-ccb-border"
                      } disabled:opacity-50`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        withdrawalConfig.auto_approve_enabled ? "translate-x-6" : "translate-x-1"
                      }`} />
                    </button>
                  </div>

                  <div className="border-t border-ccb-border my-3" />

                  {/* Config grid */}
                  <div className="grid grid-cols-2 gap-3">
                    {/* Min withdrawal */}
                    <div>
                      <label className="text-xs font-medium text-ccb-muted">Min Withdrawal (MK)</label>
                      <input
                        type="number"
                        value={configEdit.min_withdrawal ?? (withdrawalConfig.min_withdrawal || 10000)}
                        onChange={(e) => setConfigEdit(prev => ({ ...prev, min_withdrawal: e.target.value }))}
                        className="input mt-1 w-full text-sm"
                        placeholder="10"
                      />
                    </div>
                    {/* Max withdrawal */}
                    <div>
                      <label className="text-xs font-medium text-ccb-muted">Max Withdrawal (MK)</label>
                      <input
                        type="number"
                        value={configEdit.max_withdrawal ?? (withdrawalConfig.max_withdrawal || 500000)}
                        onChange={(e) => setConfigEdit(prev => ({ ...prev, max_withdrawal: e.target.value }))}
                        className="input mt-1 w-full text-sm"
                        placeholder="50000"
                      />
                    </div>
                    {/* Min deposit */}
                    <div>
                      <label className="text-xs font-medium text-ccb-muted">Min Deposit (MK)</label>
                      <input
                        type="number"
                        value={configEdit.min_deposit ?? (withdrawalConfig.min_deposit || 500)}
                        onChange={(e) => setConfigEdit(prev => ({ ...prev, min_deposit: e.target.value }))}
                        className="input mt-1 w-full text-sm"
                        placeholder="5"
                      />
                    </div>
                    {/* Daily withdrawal limit */}
                    <div>
                      <label className="text-xs font-medium text-ccb-muted">Daily Withdrawal Limit (MK)</label>
                      <input
                        type="number"
                        value={configEdit.daily_withdrawal_limit ?? (withdrawalConfig.daily_withdrawal_limit || 100000)}
                        onChange={(e) => setConfigEdit(prev => ({ ...prev, daily_withdrawal_limit: e.target.value }))}
                        className="input mt-1 w-full text-sm"
                        placeholder="10000"
                      />
                    </div>
                    {/* Withdrawal fee */}
                    <div>
                      <label className="text-xs font-medium text-ccb-muted">Withdrawal Fee (MK)</label>
                      <input
                        type="number"
                        value={configEdit.withdrawal_fee ?? (withdrawalConfig.withdrawal_fee || 0)}
                        onChange={(e) => setConfigEdit(prev => ({ ...prev, withdrawal_fee: e.target.value }))}
                        className="input mt-1 w-full text-sm"
                        placeholder="0"
                      />
                    </div>
                    {/* Processing fee % */}
                    <div>
                      <label className="text-xs font-medium text-ccb-muted">Processing Fee (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={configEdit.processing_fee_pct ?? (withdrawalConfig.processing_fee_pct || 0)}
                        onChange={(e) => setConfigEdit(prev => ({ ...prev, processing_fee_pct: e.target.value }))}
                        className="input mt-1 w-full text-sm"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      const updates: Record<string, number> = {};
                      if (configEdit.min_withdrawal !== undefined)
                        updates.min_withdrawal = Number(configEdit.min_withdrawal);
                      if (configEdit.max_withdrawal !== undefined)
                        updates.max_withdrawal = Number(configEdit.max_withdrawal);
                      if (configEdit.min_deposit !== undefined)
                        updates.min_deposit = Number(configEdit.min_deposit);
                      if (configEdit.daily_withdrawal_limit !== undefined)
                        updates.daily_withdrawal_limit = Number(configEdit.daily_withdrawal_limit);
                      if (configEdit.withdrawal_fee !== undefined)
                        updates.withdrawal_fee = Number(configEdit.withdrawal_fee);
                      if (configEdit.processing_fee_pct !== undefined)
                        updates.processing_fee_pct = Number(configEdit.processing_fee_pct);
                      if (Object.keys(updates).length > 0) handleSaveFinanceConfig(updates);
                    }}
                    disabled={financeConfigSaving || Object.keys(configEdit).length === 0}
                    className="btn-primary w-full mt-3 text-sm py-2 disabled:opacity-50"
                  >
                    {financeConfigSaving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save Settings"}
                  </button>
                </div>
              )}

              {/* Withdrawal stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="card text-center">
                  <p className="text-xs text-ccb-muted">Total Paid Out</p>
                  <p className="text-lg font-bold mt-1">
                    {formatMWK(withdrawals.reduce((s, w) => s + (w.status === "completed" ? w.amount : 0), 0))}
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-xs text-ccb-muted">Pending</p>
                  <p className="text-lg font-bold mt-1 text-ccb-accent">
                    {withdrawals.filter(w => w.status === "pending").length}
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-xs text-ccb-muted">Rejected</p>
                  <p className="text-lg font-bold mt-1 text-ccb-danger">
                    {withdrawals.filter(w => w.status === "rejected").length}
                  </p>
                </div>
              </div>

              {/* Search + Filters */}
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Search by name, phone, or amount..."
                  value={withdrawalSearch}
                  onChange={(e) => setWithdrawalSearch(e.target.value)}
                  className="input w-full text-sm"
                />
                <div className="flex gap-2 flex-wrap">
                  {["pending", "completed", "approved", "rejected", "all"].map((f) => (
                    <button
                      key={f}
                      onClick={() => setWithdrawalFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
                        withdrawalFilter === f
                          ? "bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30"
                          : "text-ccb-muted hover:text-ccb-text border border-transparent"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                const filtered = withdrawals.filter(w => {
                  if (withdrawalFilter !== "all" && w.status !== withdrawalFilter) return false;
                  if (withdrawalSearch) {
                    const q = withdrawalSearch.toLowerCase();
                    const name = (w.profiles?.display_name || w.profiles?.username || "").toLowerCase();
                    return name.includes(q) || w.phone.includes(q) || String(w.amount).includes(q);
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12 text-ccb-muted text-sm">
                      <ArrowDownUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      No withdrawals found
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    {filtered.map((w) => (
                      <div key={w.id} className="card">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold">{formatMWK(w.amount)}</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                w.status === "completed" ? "bg-ccb-success/10 text-ccb-success" :
                                w.status === "pending" ? "bg-ccb-accent/10 text-ccb-accent" :
                                w.status === "rejected" ? "bg-ccb-danger/10 text-ccb-danger" :
                                w.status === "approved" ? "bg-ccb-primary/10 text-ccb-primary" :
                                "bg-ccb-surface text-ccb-muted"
                              }`}>{w.status}</span>
                            </div>
                            <div className="text-xs text-ccb-muted mt-1.5 space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <Users className="w-3 h-3" />
                                {w.profiles?.display_name || w.profiles?.username || "Unknown"}
                                {w.profiles?.email ? ` · ${w.profiles.email}` : ""}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Smartphone className="w-3 h-3" />
                                {w.phone} · {w.operator_name}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3 h-3" />
                                {formatDate(w.created_at)}
                              </div>
                              {w.admin_notes && (
                                <div className="flex items-center gap-1.5 text-ccb-danger">
                                  <AlertCircle className="w-3 h-3" />
                                  {w.admin_notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {w.status === "pending" && (
                          <div className="mt-3 pt-3 border-t border-ccb-border space-y-2">
                            {rejectingId === w.id ? (
                              <div className="space-y-2">
                                <textarea
                                  placeholder="Reason for rejection (shown to user)..."
                                  value={rejectReason}
                                  onChange={(e) => setRejectReason(e.target.value)}
                                  className="input w-full text-sm resize-none"
                                  rows={2}
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleRejectWithReason(w.id)}
                                    disabled={actionLoading === w.id}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-danger text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                                  >
                                    {actionLoading === w.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                    Confirm Reject
                                  </button>
                                  <button
                                    onClick={() => { setRejectingId(null); setRejectReason(""); }}
                                    className="px-3 py-1.5 rounded-lg text-ccb-muted text-xs font-medium hover:text-ccb-text"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleApprove(w.id)}
                                  disabled={actionLoading === w.id}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-success text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                                >
                                  {actionLoading === w.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                  Approve & Send
                                </button>
                                <button
                                  onClick={() => { setRejectingId(w.id); setRejectReason(""); }}
                                  disabled={actionLoading === w.id}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-danger text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                                >
                                  <X className="w-3.5 h-3.5" /> Reject & Refund
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {tab === "tournaments" && (
            <div className="space-y-4">
              <PlatformSettingsPanel section="tournaments" />
              {/* STATS CARDS */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                <div className="card p-3 text-center">
                  <div className="text-xl font-bold">{tournamentStats.total}</div>
                  <div className="text-[10px] uppercase tracking-wider text-ccb-muted">Total</div>
                </div>
                <div className="card p-3 text-center">
                  <div className="text-xl font-bold text-blue-400">{tournamentStats.upcoming}</div>
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
                  <div className="text-xl font-bold text-amber-500">{tournamentStats.pending}</div>
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
                  <div className="flex items-center gap-4 px-3 py-2 mb-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-emerald-500">
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
                              t.status === "upcoming" ? "bg-blue-400/10 text-blue-400 border border-blue-400/30" :
                              t.status === "finished" || t.status === "completed" ? "bg-ccb-muted/10 text-ccb-muted border border-ccb-muted/30" :
                              t.status === "cancelled" ? "bg-ccb-danger/10 text-ccb-danger border border-ccb-danger/30" :
                              t.status === "pending_approval" ? "bg-amber-500/10 text-amber-500 border border-amber-500/30" :
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
                              <span className="flex items-center gap-1 text-emerald-500 font-medium"><TrendingUp className="w-3 h-3" />{formatMWK(t.revenue || 0)} ({t.paid_count || 0} paid)</span>
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
                          managingTournament.status === "upcoming" ? "bg-blue-400/10 text-blue-400 border border-blue-400/30" :
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
                            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
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
                              <span className="font-medium text-emerald-500">{formatMWK(rev.totalCollected)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-ccb-muted">Prize pool</span>
                              <span className="font-medium">{formatMWK(rev.prizePool)}</span>
                            </div>
                            {rev.poolSource === 'fixed' && rev.platformRevenue > 0 && (
                              <div className="flex justify-between col-span-2 pt-1 border-t border-ccb-border">
                                <span className="text-ccb-muted">Platform revenue (fixed pool surplus)</span>
                                <span className="font-bold text-emerald-500">{formatMWK(rev.platformRevenue)}</span>
                              </div>
                            )}
                            {rev.creatorProfit > 0 && (
                              <>
                                <div className="flex justify-between">
                                  <span className="text-ccb-muted">Creator profit ({rev.creatorProfitPercent}%)</span>
                                  <span className="font-medium text-blue-400">{formatMWK(rev.creatorProfit)}</span>
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
            </div>
          )}


          {/* GAMES */}
          {tab === "games" && (
            <div className="space-y-4">
              <PlatformSettingsPanel section="games" />
              <div className="flex gap-2">
                {["all", "playing", "completed", "aborted", "draw"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setGamesFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
                      gamesFilter === f
                        ? "bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30"
                        : "text-ccb-muted hover:text-ccb-text border border-transparent"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {games.length === 0 ? (
                <div className="text-center py-12 text-ccb-muted text-sm">
                  <Gamepad2 className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No games found
                </div>
              ) : (
                <div className="space-y-2">
                  {games.map((g) => (
                    <div key={g.id} className="card flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">
                          {g.white_username} ({g.white_rating}) vs {g.black_username} ({g.black_rating})
                        </div>
                        <div className="text-xs text-ccb-muted mt-1">
                          {g.time_control} · {g.rated ? "Rated" : "Casual"} · {g.move_count} moves · {formatDate(g.created_at)}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs px-2 py-1 rounded ${
                          g.status === "playing" ? "bg-ccb-success/10 text-ccb-success" :
                          g.status === "completed" ? "bg-ccb-muted/10 text-ccb-muted" :
                          g.status === "aborted" ? "bg-ccb-danger/10 text-ccb-danger" :
                          "bg-ccb-surface text-ccb-muted"
                        }`}>{g.status}</span>
                        {g.winner && <span className="text-xs text-ccb-muted">{g.winner} won</span>}
                        {g.status === "playing" && (
                          <button
                            onClick={() => handleGameAbort(g.id)}
                            disabled={actionLoading === g.id}
                            className="text-xs px-2 py-1 rounded bg-ccb-danger/10 text-ccb-danger hover:bg-ccb-danger/20 disabled:opacity-50"
                          >
                            {actionLoading === g.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Abort"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DEPOSITS */}

          {tab === "deposits" && (
            <div className="space-y-4">
              <PlatformSettingsPanel section="deposits" />
              {/* Deposit stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                <div className="card text-center">
                  <p className="text-xs text-ccb-muted">Total Credited</p>
                  <p className="text-base font-bold mt-1">
                    {formatMWK(deposits.reduce((s, d) => s + (d.status === "success" ? d.amount : 0), 0))}
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-xs text-ccb-muted">Pending</p>
                  <p className="text-base font-bold mt-1 text-ccb-accent">
                    {deposits.filter(d => d.status === "pending").length}
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-xs text-ccb-muted">Successful</p>
                  <p className="text-base font-bold mt-1 text-ccb-success">
                    {deposits.filter(d => d.status === "success").length}
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-xs text-ccb-muted">Failed</p>
                  <p className="text-base font-bold mt-1 text-ccb-danger">
                    {deposits.filter(d => d.status === "failed").length}
                  </p>
                </div>
              </div>

              {/* Search + Filters */}
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Search by name, phone, tx ref, or amount..."
                  value={depositSearch}
                  onChange={(e) => setDepositSearch(e.target.value)}
                  className="input w-full text-sm"
                />
                <div className="flex gap-2 flex-wrap">
                  {["all", "pending", "processing", "success", "failed"].map((f) => (
                    <button
                      key={f}
                      onClick={() => setDepositFilter(f)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
                        depositFilter === f
                          ? "bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30"
                          : "text-ccb-muted hover:text-ccb-text border border-transparent"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                const filtered = deposits.filter(d => {
                  if (depositFilter !== "all" && d.status !== depositFilter) return false;
                  if (depositSearch) {
                    const q = depositSearch.toLowerCase();
                    const name = (d.profiles?.display_name || d.profiles?.username || "").toLowerCase();
                    return name.includes(q) ||
                      (d.phone || "").includes(q) ||
                      (d.tx_ref || "").toLowerCase().includes(q) ||
                      (d.charge_id || "").toLowerCase().includes(q) ||
                      String(d.amount).includes(q);
                  }
                  return true;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12 text-ccb-muted text-sm">
                      <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      No deposits found
                    </div>
                  );
                }

                return (
                  <div className="space-y-2">
                    {filtered.map((d) => (
                      <div key={d.id} className="card">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">{formatMWK(d.amount)}</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                d.status === "success" ? "bg-ccb-success/10 text-ccb-success" :
                                d.status === "pending" ? "bg-ccb-accent/10 text-ccb-accent" :
                                d.status === "processing" ? "bg-ccb-primary/10 text-ccb-primary" :
                                d.status === "failed" ? "bg-ccb-danger/10 text-ccb-danger" :
                                "bg-ccb-surface text-ccb-muted"
                              }`}>{d.status}</span>
                              <span className="text-xs text-ccb-muted">{d.method === "mobile_money" ? "MoMo" : d.method}</span>
                            </div>
                            <div className="text-xs text-ccb-muted mt-1.5 space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <Users className="w-3 h-3" />
                                {d.profiles?.display_name || d.profiles?.username || "Unknown"}
                                {d.profiles?.email ? ` · ${d.profiles.email}` : ""}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Smartphone className="w-3 h-3" />
                                {d.method === "mobile_money" ? "Mobile Money" : "Card"}
                                {d.phone ? ` · ${d.phone}` : ""}
                                {d.operator ? ` · ${d.operator}` : ""}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Clock className="w-3 h-3" />
                                {formatDate(d.created_at)}
                                {d.tx_ref ? ` · ${d.tx_ref.slice(0, 24)}...` : ""}
                              </div>
                              {d.admin_notes && (
                                <div className="flex items-center gap-1.5 text-ccb-muted">
                                  <FileText className="w-3 h-3" />
                                  {d.admin_notes}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons for pending/processing deposits */}
                        {(d.status === "pending" || d.status === "processing") && (
                          <div className="mt-3 pt-3 border-t border-ccb-border space-y-2">
                            {creditingId === d.id ? (
                              <div className="space-y-2">
                                <textarea
                                  placeholder="Reason for manual credit (e.g. 'Paychangu confirmed via dashboard')..."
                                  value={creditNotes}
                                  onChange={(e) => setCreditNotes(e.target.value)}
                                  className="input w-full text-sm resize-none"
                                  rows={2}
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleCreditWithNotes(d.id)}
                                    disabled={actionLoading === `${d.id}_credit`}
                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-success text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                                  >
                                    {actionLoading === `${d.id}_credit` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                    Confirm Credit
                                  </button>
                                  <button
                                    onClick={() => { setCreditingId(null); setCreditNotes(""); }}
                                    className="px-3 py-1.5 rounded-lg text-ccb-muted text-xs font-medium hover:text-ccb-text"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-2 flex-wrap">
                                <button
                                  onClick={() => handleVerifyDeposit(d.id)}
                                  disabled={actionLoading === `${d.id}_verify`}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-primary text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                                >
                                  {actionLoading === `${d.id}_verify` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                                  Verify
                                </button>
                                <button
                                  onClick={() => { setCreditingId(d.id); setCreditNotes(""); }}
                                  disabled={actionLoading === `${d.id}_credit`}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-success text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                                >
                                  <Check className="w-3.5 h-3.5" /> Manual Credit
                                </button>
                                <button
                                  onClick={() => handleRejectDeposit(d.id)}
                                  disabled={actionLoading === `${d.id}_reject`}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-danger text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                                >
                                  {actionLoading === `${d.id}_reject` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                  Reject
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

          {tab === "battles" && (
            <div className="space-y-4">
              <PlatformSettingsPanel section="battles" />
              {battleConfig && (
                <div className="card space-y-4">
                  <div className="flex items-center gap-2">
                    <Swords className="w-5 h-5 text-ccb-primary" />
                    <h3 className="font-medium">Battle Configuration</h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="battle-enabled"
                      checked={battleConfig.enabled ?? true}
                      onChange={(e) => setBattleConfig({ ...battleConfig, enabled: e.target.checked })}
                      className="w-4 h-4 rounded"
                    />
                    <label htmlFor="battle-enabled" className="text-sm font-medium cursor-pointer">
                      Enable Chess Battles
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs text-ccb-muted mb-1 block">
                        Stake Levels (MWK, comma-separated)
                      </label>
                      <input
                        type="text"
                        value={
                          typeof battleConfig.stake_levels === "string"
                            ? battleConfig.stake_levels
                            : Array.isArray(battleConfig.stake_levels)
                            ? battleConfig.stake_levels.join(", ")
                            : ""
                        }
                        onChange={(e) =>
                          setBattleConfig({ ...battleConfig, stake_levels: e.target.value })
                        }
                        placeholder="500, 1000, 2500, 5000, 10000"
                        className="w-full px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm"
                      />
                    </div>
                    <ConfigInput
                      label="Min Games for Battles"
                      value={battleConfig.min_games_for_battles}
                      onChange={(v) =>
                        setBattleConfig({ ...battleConfig, min_games_for_battles: v })
                      }
                    />
                    <ConfigInput
                      label="Platform Fee (%)"
                      value={battleConfig.platform_fee_pct}
                      onChange={(v) => setBattleConfig({ ...battleConfig, platform_fee_pct: v })}
                    />
                    <ConfigInput
                      label="Rating Range (+/-)"
                      value={battleConfig.rating_range}
                      onChange={(v) => setBattleConfig({ ...battleConfig, rating_range: v })}
                    />
                    <ConfigInput
                      label="Initial Minutes"
                      value={battleConfig.initial_minutes}
                      onChange={(v) => setBattleConfig({ ...battleConfig, initial_minutes: v })}
                    />
                    <ConfigInput
                      label="Increment (seconds)"
                      value={battleConfig.increment_seconds}
                      onChange={(v) => setBattleConfig({ ...battleConfig, increment_seconds: v })}
                    />
                    <ConfigInput
                      label="Armageddon Time (%)"
                      value={battleConfig.armageddon_pct}
                      onChange={(v) => setBattleConfig({ ...battleConfig, armageddon_pct: v })}
                    />
                    <ConfigInput
                      label="Max Armageddon Rounds"
                      value={battleConfig.max_armageddon_rounds}
                      onChange={(v) => setBattleConfig({ ...battleConfig, max_armageddon_rounds: v })}
                    />
                    <ConfigInput
                      label="Queue Timeout (seconds)"
                      value={battleConfig.queue_timeout_s}
                      onChange={(v) => setBattleConfig({ ...battleConfig, queue_timeout_s: v })}
                    />
                  </div>

                  <button
                    onClick={saveBattleConfig}
                    disabled={battleConfigSaving}
                    className="w-full py-2.5 rounded-lg bg-ccb-primary text-white text-sm font-medium hover:bg-ccb-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {battleConfigSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Battle Config
                  </button>
                </div>
              )}

              {battleStats?.stats && (
                <div className="card space-y-3">
                  <h3 className="font-medium text-sm text-ccb-muted uppercase tracking-wide">Battle Stats</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div>
                      <p className="text-2xl font-bold text-ccb-primary">
                        {(battleStats.stats.completedBattles || 0) +
                          (battleStats.stats.activeBattles || 0) +
                          (battleStats.stats.disputedBattles || 0)}
                      </p>
                      <p className="text-xs text-ccb-muted">Total</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-ccb-success">
                        {battleStats.stats.completedBattles || 0}
                      </p>
                      <p className="text-xs text-ccb-muted">Completed</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-ccb-accent">
                        {battleStats.stats.activeBattles || 0}
                      </p>
                      <p className="text-xs text-ccb-muted">Active</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-ccb-danger">
                        {battleStats.stats.disputedBattles || 0}
                      </p>
                      <p className="text-xs text-ccb-muted">Disputed</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-ccb-text">
                        {formatMWK(battleStats.stats.totalVolume)}
                      </p>
                      <p className="text-xs text-ccb-muted">Total Volume</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-ccb-success">
                        {formatMWK(battleStats.stats.totalRevenue)}
                      </p>
                      <p className="text-xs text-ccb-muted">Platform Revenue</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-ccb-accent">
                        {formatMWK(battleStats.stats.lockedFunds)}
                      </p>
                      <p className="text-xs text-ccb-muted">Locked Funds</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-ccb-primary">
                        {battleStats.stats.waitingPlayers || 0}
                      </p>
                      <p className="text-xs text-ccb-muted">Waiting</p>
                    </div>
                  </div>
                </div>
              )}

              {battleStats?.recentBattles && battleStats.recentBattles.length > 0 && (
                <div className="card">
                  <h3 className="font-medium text-sm text-ccb-muted uppercase tracking-wide mb-3">Recent Battles</h3>
                  <div className="space-y-2">
                    {battleStats.recentBattles.map((b: any) => (
                      <div key={b.id} className="flex items-center justify-between text-sm py-2 border-b border-ccb-border last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="text-ccb-muted">{b.white_player?.username || "?"} vs {b.black_player?.username || "?"}</span>
                          {b.armageddon_round > 0 && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-ccb-accent/10 text-ccb-accent">AG{b.armageddon_round}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium">{formatMWK(b.stake)}</span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            b.status === "completed" ? "bg-ccb-success/10 text-ccb-success" :
                            b.status === "playing" || b.status === "draw_armageddon" ? "bg-ccb-accent/10 text-ccb-accent" :
                            b.status === "disputed" ? "bg-ccb-danger/10 text-ccb-danger" :
                            "bg-ccb-muted/10 text-ccb-muted"
                          }`}>{b.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ADMIN LOGS */}
          {tab === "logs" && (
            <div className="space-y-2">
              <PlatformSettingsPanel section="logs" />
              {logs.length === 0 ? (
                <div className="text-center py-12 text-ccb-muted text-sm">
                  <ScrollText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No admin actions logged
                </div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="card flex items-center justify-between text-sm">
                    <div>
                      <span className="font-medium">{log.action}</span>
                      <span className="text-ccb-muted ml-2">
                        by {log.profiles?.display_name || log.profiles?.username || "Admin"}
                      </span>
                    </div>
                    <div className="text-xs text-ccb-muted">
                      {log.target_type}:{log.target_id?.slice(0, 8)} · {formatDate(log.created_at)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* LEAGUES MANAGEMENT */}
          {tab === "leagues" && (
            <div className="space-y-4">
              <PlatformSettingsPanel section="leagues" />
              <LeagueManager />
            </div>
          )}

          {/* SEASONS MANAGEMENT */}
          {tab === "seasons" && (
            <div className="space-y-4">
              <PlatformSettingsPanel section="seasons" />
              {/* Create new season */}
              <div className="card space-y-3">
                <h3 className="text-sm font-bold flex items-center gap-2"><Calendar className="w-4 h-4 text-ccb-primary" /> Create New Season</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <input type="text" placeholder="Season name" value={newSeason.name} onChange={(e) => setNewSeason((p) => ({ ...p, name: e.target.value }))} className="px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm col-span-2" />
                  <select value={newSeason.country} onChange={(e) => setNewSeason((p) => ({ ...p, country: e.target.value }))} className="px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm">
                    <option value="MW">Malawi</option>
                    <option value="ZM">Zambia</option>
                    <option value="KE">Kenya</option>
                    <option value="NG">Nigeria</option>
                    <option value="ZA">South Africa</option>
                    <option value="GLOBAL">Global</option>
                  </select>
                  <input type="date" value={newSeason.start_date} onChange={(e) => setNewSeason((p) => ({ ...p, start_date: e.target.value }))} className="px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm" />
                  <input type="date" value={newSeason.end_date} onChange={(e) => setNewSeason((p) => ({ ...p, end_date: e.target.value }))} className="px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm col-span-2 sm:col-span-1" />
                </div>
                <ActionButton onClick={createSeason} loading={actionLoading === "new-season"} variant="primary">Create Season</ActionButton>
              </div>
              {/* Existing seasons */}
              {adminSeasons.length === 0 ? (
                <div className="text-center py-8 text-ccb-muted text-sm">
                  <Calendar className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No seasons yet
                </div>
              ) : (
                adminSeasons.map((season: any) => (
                  <div key={season.id} className="card flex items-center justify-between">
                    <div>
                      <span className="font-bold text-sm">{season.name}</span>
                      <span className="text-xs text-ccb-muted ml-2">{season.country} · {season.start_date} to {season.end_date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${season.status === "active" ? "bg-ccb-success/10 text-ccb-success" : season.status === "completed" ? "bg-ccb-surface text-ccb-muted" : "bg-ccb-accent/10 text-ccb-accent"}`}>{season.status}</span>
                      {season.status !== "active" && season.status !== "completed" && (
                        <ActionButton onClick={() => updateSeason(season.id, "active")} loading={actionLoading === season.id} variant="success">Activate</ActionButton>
                      )}
                      {season.status === "active" && (
                        <ActionButton onClick={() => updateSeason(season.id, "completed")} loading={actionLoading === season.id} variant="danger">Complete</ActionButton>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* MEMBERSHIP PRICING */}
          {tab === "membership" && (
            <div className="space-y-4">
              <PlatformSettingsPanel section="membership" />
              <div className="card p-4">
                <h3 className="text-sm font-bold flex items-center gap-2 mb-2"><Crown className="w-4 h-4 text-ccb-primary" /> Membership Pricing</h3>
                <p className="text-xs text-ccb-muted">Configure the monthly membership fee for each market. Players pay this to access Premium Leagues and exclusive competitions. Yearly pricing is automatically calculated as 10x monthly (2 months free).</p>
              </div>
              {marketConfigs.length === 0 ? (
                <div className="text-center py-8 text-ccb-muted text-sm">
                  <Crown className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No market configs found. Run database migrations first.
                </div>
              ) : (
                marketConfigs.map((config: any) => (
                  <div key={config.country_code} className="card space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{config.country_name}</span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-ccb-surface text-ccb-muted">{config.country_code}</span>
                        {config.is_default && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-ccb-primary/10 text-ccb-primary">DEFAULT</span>}
                      </div>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${config.membership_active ? "bg-ccb-success/10 text-ccb-success" : "bg-ccb-muted/10 text-ccb-muted"}`}>
                        {config.membership_active ? "ACTIVE" : "INACTIVE"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs text-ccb-muted mb-1 block">Monthly Price (MWK)</label>
                        <input
                          type="number"
                          value={marketEdits[config.country_code]?.membership_price ?? config.membership_price}
                          onChange={(e) => setMarketEdits((p: any) => ({ ...p, [config.country_code]: { ...p[config.country_code], membership_price: e.target.value } }))}
                          className="w-full px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm"
                          placeholder="10000"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-ccb-muted mb-1 block">Currency</label>
                        <input
                          type="text"
                          value={marketEdits[config.country_code]?.membership_currency ?? config.membership_currency}
                          onChange={(e) => setMarketEdits((p: any) => ({ ...p, [config.country_code]: { ...p[config.country_code], membership_currency: e.target.value } }))}
                          className="w-full px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm"
                          placeholder="MWK"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-ccb-muted mb-1 block">Membership Active</label>
                        <select
                          value={marketEdits[config.country_code]?.membership_active ?? config.membership_active}
                          onChange={(e) => setMarketEdits((p: any) => ({ ...p, [config.country_code]: { ...p[config.country_code], membership_active: e.target.value === "true" } }))}
                          className="w-full px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm"
                        >
                          <option value="true">Active</option>
                          <option value="false">Inactive</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-ccb-muted">
                        Display: <span className="text-ccb-text font-medium">
                          {Math.floor(marketEdits[config.country_code]?.membership_price ?? config.membership_price).toLocaleString()}
                          {" "}{marketEdits[config.country_code]?.membership_currency ?? config.membership_currency}/month
                        </span>
                      </span>
                      <ActionButton onClick={() => saveMarketConfig(config.country_code)} loading={actionLoading === config.country_code} variant="primary">Save</ActionButton>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

          {/* VERIFICATION */}
          {tab === "verification" && (
            <div className="space-y-4">
              <PlatformSettingsPanel section="verification" />
              <div className="flex items-center gap-2">
                {(["pending", "verified", "all"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setVerificationFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      verificationFilter === f
                        ? "bg-ccb-primary text-white"
                        : "bg-ccb-surface text-ccb-muted hover:text-ccb-text"
                    }`}
                  >
                    {f === "pending" ? "Pending" : f === "verified" ? "Verified" : "All"}
                  </button>
                ))}
              </div>

              {verificationLoading ? (
                <div className="card p-8 text-center">
                  <Loader2 className="w-6 h-6 mx-auto mb-2 text-ccb-muted animate-spin" />
                </div>
              ) : verificationPlayers.length === 0 ? (
                <div className="card p-8 text-center">
                  <Shield className="w-8 h-8 mx-auto mb-2 text-ccb-muted opacity-50" />
                  <p className="text-sm text-ccb-muted">
                    {verificationFilter === "pending" ? "No players pending verification" : "No players found"}
                  </p>
                </div>
              ) : (
                verificationPlayers.map((p: any) => (
                  <div key={p.id} className="card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-ccb-surface border border-ccb-border overflow-hidden flex items-center justify-center shrink-0">
                          {p.avatar_url ? (
                            <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <UserRound className="w-5 h-5 text-ccb-muted" />
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-sm">{p.display_name || p.username || "Unknown"}</div>
                          <div className="text-xs text-ccb-muted">{p.email}</div>
                          {p.phone && <div className="text-xs text-ccb-muted">{p.phone}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          p.gender === "female" ? "bg-pink-500/10 text-pink-400" :
                          p.gender === "male" ? "bg-blue-500/10 text-blue-400" :
                          "bg-ccb-surface text-ccb-muted"
                        }`}>
                          {p.gender || "Not set"}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          p.identity_verified ? "bg-ccb-success/10 text-ccb-success" : "bg-amber-500/10 text-amber-500"
                        }`}>
                          {p.identity_verified ? "Verified" : "Unverified"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <select
                        defaultValue={p.gender || ""}
                        id={`gender-override-${p.id}`}
                        className="px-3 py-1.5 rounded-lg bg-ccb-surface border border-ccb-border text-xs font-medium"
                      >
                        <option value="">Confirm gender...</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                      <ActionButton
                        onClick={() => {
                          const select = document.getElementById(`gender-override-${p.id}`) as HTMLSelectElement;
                          verifyIdentity(p.id, "verify", select.value || undefined);
                        }}
                        loading={actionLoading === `${p.id}_verify`}
                        variant="success"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" /> Verify
                      </ActionButton>
                      {p.identity_verified && (
                        <ActionButton
                          onClick={() => verifyIdentity(p.id, "reject")}
                          loading={actionLoading === `${p.id}_verify`}
                          variant="danger"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Revoke
                        </ActionButton>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ========== PLATFORM SETTINGS ========== */}
          {tab === "settings" && (
            <PlatformSettingsHub />
          )}


        {/* USER DETAIL MODAL */}
        {userDetailId && (
          <UserDetailModal
            userId={userDetailId}
            onClose={() => setUserDetailId(null)}
            onAction={handleUserAction}
            onDelete={handleDeleteUser}
            actionLoading={actionLoading}
            formatMWK={formatMWK}
          />
        )}
        </div>
      </div>
    </div>
  );
}

function PlatformSettingsHub() {
  const [settingsSection, setSettingsSection] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["battles", "withdrawals"]));

  const settingSections = [
    { id: "battles", label: "Battles", icon: Swords, desc: "Stakes, fees, auto-cancel" },
    { id: "withdrawals", label: "Withdrawals", icon: ArrowDownUp, desc: "Limits, fees, approval" },
    { id: "deposits", label: "Deposits", icon: DollarSign, desc: "Limits, auto-credit, approval" },
    { id: "tournaments", label: "Tournaments", icon: Trophy, desc: "Approval, max players" },
    { id: "games", label: "Games", icon: Gamepad2, desc: "Spectators, concurrency" },
    { id: "users", label: "Users", icon: Users, desc: "Signups, verification, admin" },
    { id: "leagues", label: "Leagues", icon: Crown, desc: "Membership, promotion/relegation" },
    { id: "seasons", label: "Seasons", icon: Calendar, desc: "Auto-create, duration, overlap" },
    { id: "membership", label: "Membership", icon: Shield, desc: "Auto-renew, grace period" },
    { id: "verification", label: "Verification", icon: ShieldCheck, desc: "ID, selfie, auto-approve" },
    { id: "logs", label: "Logs", icon: ScrollText, desc: "Retention period" },
    { id: "overview", label: "Dashboard", icon: LayoutDashboard, desc: "Refresh, KPI cards" },
  ];

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredSections = settingSections.filter(s => {
    if (searchQuery) {
      return s.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
             s.desc.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-ccb-primary/10 flex items-center justify-center">
            <SlidersHorizontal className="w-5 h-5 text-ccb-primary" />
          </div>
          <div>
            <h2 className="font-bold text-lg">Platform Settings</h2>
            <p className="text-xs text-ccb-muted">Configure all platform behavior in one place. Changes apply instantly across the entire site.</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ccb-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search settings..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm focus:outline-none focus:border-ccb-primary/50"
          />
        </div>
      </div>

      {/* QUICK NAV CHIPS */}
      <div className="flex gap-1.5 flex-wrap">
        {settingSections.map(s => {
          const Icon = s.icon;
          const isExpanded = expandedSections.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggleSection(s.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isExpanded
                  ? "bg-ccb-primary text-white"
                  : "bg-ccb-surface text-ccb-muted hover:text-ccb-text border border-ccb-border"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* SETTINGS SECTIONS */}
      <div className="space-y-3">
        {filteredSections.map(s => {
          const Icon = s.icon;
          const isExpanded = expandedSections.has(s.id);
          return (
            <div key={s.id} className={`card overflow-hidden transition-all ${isExpanded ? "" : "opacity-60"}`}>
              <button
                onClick={() => toggleSection(s.id)}
                className="w-full flex items-center gap-3 p-4 hover:bg-ccb-surface/50 transition-colors"
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  isExpanded ? "bg-ccb-primary/10 text-ccb-primary" : "bg-ccb-surface text-ccb-muted"
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-bold text-sm">{s.label}</div>
                  <div className="text-xs text-ccb-muted truncate">{s.desc}</div>
                </div>
                <ChevronDown className={`w-4 h-4 text-ccb-muted transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-ccb-border/50">
                  <PlatformSettingsPanel section={s.id} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FOOTER NOTE */}
      <div className="card p-4 flex items-start gap-2.5">
        <Database className="w-4 h-4 text-ccb-muted shrink-0 mt-0.5" />
        <p className="text-xs text-ccb-muted">
          Settings are stored in the <code className="text-ccb-text font-mono">platform_settings</code> table and synced to legacy config tables (battle_config, withdrawal_config) automatically. All backend routes read from these values.
        </p>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: any; color: string }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-ccb-muted">{label}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}

function ActionButton({ children, onClick, loading, variant }: { children: React.ReactNode; onClick: () => void; loading: boolean; variant: "primary" | "danger" | "success" | "default" }) {
  const colors = {
    primary: "bg-ccb-primary/10 text-ccb-primary hover:bg-ccb-primary/20",
    danger: "bg-ccb-danger/10 text-ccb-danger hover:bg-ccb-danger/20",
    success: "bg-ccb-success/10 text-ccb-success hover:bg-ccb-success/20",
    default: "bg-ccb-surface text-ccb-muted hover:text-ccb-text border border-ccb-border",
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${colors[variant]}`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : children}
    </button>
  );
}

function ConfigInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs text-ccb-muted mb-1 block">{label}</label>
      <input
        type="number"
        value={value ?? 0}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="w-full px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm"
      />
    </div>
  );
}
