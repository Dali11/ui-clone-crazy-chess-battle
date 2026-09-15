"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  LayoutDashboard, Users, ArrowDownUp, Trophy, Loader2, Check, X, Coins, Smartphone, Shield, Clock,
  TrendingUp, Wallet, AlertCircle, ChevronRight, Gamepad2,
  Ban, Star, DollarSign, Search, Save, ScrollText, Swords,
  ShieldCheck, UserRound, XCircle, ShieldAlert,
  Menu, LogOut, Crown, Play,
  Copy, Trash2, Edit3, Share2, Gift, Calendar,
  Settings, FileText, SlidersHorizontal, Database, ChevronDown, FileCheck,
} from "lucide-react";
import PlatformSettingsPanel from "./platform-settings-panel";
import CommunityRoomsCard from "./components/community-rooms-card";
import LeaguesAdminPanel from "./components/leagues-admin-panel";
import UserDetailModal from "./user-detail-modal";
import { type Withdrawal, type Stats, type UserInfo, type Deposit, type Tournament, type GameInfo, type AdminLog, type Tab, localToUTC, utcToLocalInput } from "./types";
import { ActionButton, ConfigInput } from "./components/shared";
import PlatformSettingsHub from "./components/platform-settings-hub";
import BattlesAdminPanel from "./components/battles-admin-panel";
import ResultOverrideModal from "./components/result-override-modal";
import OverviewPanel from "./components/overview-panel";
import TournamentsPanel from "./components/tournaments-panel";
import WithdrawalsPanel from "./components/withdrawals-panel";
import IntegrityPanel from "./components/integrity-panel";
import DepositsPanel from "./components/deposits-panel";


export default function AdminDashboard({ adminName }: { adminName: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<Stats | null>(null);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [integrityFlags, setIntegrityFlags] = useState<any[]>([]);
  const [integrityLoading, setIntegrityLoading] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanResult, setScanResult] = useState<Record<string, any> | null>(null);
  const [integrityActionLoading, setIntegrityActionLoading] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [games, setGames] = useState<GameInfo[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [overrideGame, setOverrideGame] = useState<GameInfo | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [marketConfigs, setMarketConfigs] = useState<any[]>([]);
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
  const [userStatus, setUserStatus] = useState("all");
  const [userSort, setUserSort] = useState("newest");
  const [userPage, setUserPage] = useState(0);
  const [usersTotal, setUsersTotal] = useState(0);
  const [userKpis, setUserKpis] = useState<any>(null);
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
  const [kycSubmissions, setKycSubmissions] = useState<any[]>([]);
  const [kycLoading, setKycLoading] = useState(false);
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

  const USER_PAGE_SIZE = 50;
  const fetchUsers = useCallback(async () => {
    const p = new URLSearchParams({
      page: String(userPage),
      page_size: String(USER_PAGE_SIZE),
      status: userStatus,
      sort: userSort,
    });
    if (userSearch.trim()) p.set("search", userSearch.trim());
    const res = await fetch(`/api/admin/users?${p.toString()}`);
    const data = await res.json();
    setUsers(data.users || []);
    setUsersTotal(data.total ?? 0);
    if (data.kpis) setUserKpis(data.kpis);
  }, [userPage, userStatus, userSort, userSearch]);

  // Refetch (debounced) whenever the users tab is active and any filter changes
  useEffect(() => {
    if (tab !== "users") return;
    const t = setTimeout(() => { fetchUsers(); }, 300);
    return () => clearTimeout(t);
  }, [tab, fetchUsers]);

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

  const fetchIntegrity = useCallback(async () => {
    setIntegrityLoading(true);
    try {
      const res = await fetch("/api/admin/integrity/flags?status=all");
      const data = await res.json();
      setIntegrityFlags(data.flags || []);
    } finally {
      setIntegrityLoading(false);
    }
  }, []);

  const runIntegrityScan = useCallback(async () => {
    setScanLoading(true);
    try {
      const res = await fetch("/api/admin/integrity/scan", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setScanResult(data);
        await fetchIntegrity();
        await fetchStats();
      } else {
        alert(`Scan failed: ${data.error || "unknown error"}`);
      }
    } finally {
      setScanLoading(false);
    }
  }, [fetchIntegrity, fetchStats]);

  const handleIntegrityAction = useCallback(async (flagId: string, action: "dismiss" | "confirm" | "reopen") => {
    setIntegrityActionLoading(flagId);
    try {
      const res = await fetch("/api/admin/integrity/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flagId, action }),
      });
      const data = await res.json();
      if (res.ok) {
        if (data.released > 0) {
          alert(`Flag ${action}ed — released ${data.released} held payout(s) to the player's wallet.`);
        }
        await fetchIntegrity();
        await fetchStats();
      } else {
        alert(`Action failed: ${data.error || "unknown error"}`);
      }
    } finally {
      setIntegrityActionLoading(null);
    }
  }, [fetchIntegrity, fetchStats]);


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

  useEffect(() => {
    if (tab === "verification") fetchVerificationPlayers();
  }, [verificationFilter]);

  const fetchKycSubmissions = useCallback(async () => {
    setKycLoading(true);
    try {
      const res = await fetch("/api/admin/kyc?filter=pending");
      const d = await res.json();
      if (res.ok) setKycSubmissions(d.submissions || []);
    } catch {} finally { setKycLoading(false); }
  }, []);

  const reviewKyc = async (id: string, decision: "approve" | "reject") => {
    let reason: string | undefined;
    if (decision === "reject") {
      reason = prompt("Reason for rejection (shown to the player):") || "Document didn't match your profile details";
    }
    setActionLoading(id);
    try {
      const res = await fetch("/api/admin/kyc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: id, decision, reason }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Review failed");
      setKycSubmissions((prev) => prev.filter((k) => k.id !== id));
      await fetchVerificationPlayers();
      showToast(decision === "approve" ? "Identity approved" : "Submission rejected");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setActionLoading(null);
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchStats();
      if (tab === "withdrawals") { await fetchWithdrawals(); await fetchWithdrawalConfig(); }
      if (tab === "deposits") await fetchDeposits();
      if (tab === "tournaments") await fetchTournaments();
      if (tab === "games") await fetchGames();
      if (tab === "logs") await fetchLogs();
      if (tab === "battles") await fetchBattleStats();
      
      if (tab === "integrity") await fetchIntegrity();
      if (tab === "verification") { await fetchVerificationPlayers(); await fetchKycSubmissions(); }
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

  const handleOverrideConfirm = async (winner: "white" | "black" | "draw") => {
    if (!overrideGame) return;
    const winnerLabel = winner === "white" ? overrideGame.white_username : winner === "black" ? overrideGame.black_username : "Draw";
    setActionLoading(overrideGame.id);
    try {
      const res = await fetch("/api/admin/games", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: overrideGame.id, action: "set_result", winner, note: `Admin manual override: ${winnerLabel}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await fetchGames();
      const suffix = data.tournamentRecorded ? " — tournament updated" : "";
      showToast(`Result set: ${winnerLabel}${suffix}`);
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
    { id: "integrity", label: "Integrity", icon: ShieldAlert, badge: stats?.openIntegrityFlags || undefined },
    { id: "logs", label: "Logs", icon: ScrollText },
    { id: "leagues", label: "Leagues", icon: Crown },
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
            { label: "Compete", items: ["tournaments", "games", "leagues"] },
            { label: "Community", items: ["users", "verification"] },
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
              <OverviewPanel formatMWK={formatMWK} onNavigate={(t) => setTab(t as Tab)} />
            </div>
          )}

          {/* USERS */}
          {tab === "users" && (
            <div className="space-y-3">
              <PlatformSettingsPanel section="users" />
              <CommunityRoomsCard />

              {/* KPIs */}
              {userKpis && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {[
                    { label: "Total Users", value: userKpis.total, sub: `${userKpis.new_7d} new this week`, icon: Users },
                    { label: "New (30d)", value: userKpis.new_30d, sub: `${userKpis.new_7d} in last 7 days`, icon: TrendingUp },
                    { label: "Active Players", value: userKpis.active_players, sub: "played ≥ 1 game", icon: Swords },
                    { label: "Avg Rating", value: userKpis.avg_rating, sub: `${userKpis.admins} admin${userKpis.admins === 1 ? "" : "s"}`, icon: Star },
                    { label: "Wallet Liability", value: formatMWK(userKpis.wallet_liability), sub: `${userKpis.negative_wallets} negative balance${userKpis.negative_wallets === 1 ? "" : "s"}`, icon: Wallet },
                    { label: "Banned", value: userKpis.banned, sub: "suspended accounts", icon: Ban },
                  ].map((k) => (
                    <div key={k.label} className="card p-3">
                      <div className="flex items-center gap-1.5 text-xs text-ccb-muted">
                        <k.icon className="w-3.5 h-3.5" /> {k.label}
                      </div>
                      <div className="text-lg font-bold mt-1">{k.value}</div>
                      <div className="text-[11px] text-ccb-muted">{k.sub}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Search + filters + sort */}
              <div className="flex flex-col lg:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ccb-muted" />
                  <input
                    type="text"
                    placeholder="Search users by name, email... (searches all pages)"
                    value={userSearch}
                    onChange={(e) => { setUserSearch(e.target.value); setUserPage(0); }}
                    className="w-full pl-10 pr-4 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm"
                  />
                </div>
                <select
                  value={userSort}
                  onChange={(e) => { setUserSort(e.target.value); setUserPage(0); }}
                  className="px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="rating">Highest rating</option>
                  <option value="games">Most games</option>
                  <option value="wallet">Wallet balance</option>
                  <option value="username">Username A–Z</option>
                </select>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: "all", label: `All (${userKpis?.total ?? "…"})` },
                  { id: "new", label: `New 30d (${userKpis?.new_30d ?? "…"})` },
                  { id: "active", label: `Active (${userKpis?.active_players ?? "…"})` },
                  { id: "admins", label: `Admins (${userKpis?.admins ?? "…"})` },
                  { id: "banned", label: `Banned (${userKpis?.banned ?? "…"})` },
                  { id: "negative", label: `Negative wallets (${userKpis?.negative_wallets ?? "…"})` },
                ].map((c) => (
                  <button
                    key={c.id}
                    onClick={() => { setUserStatus(c.id); setUserPage(0); }}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      userStatus === c.id
                        ? "bg-ccb-primary text-ccb-dark font-bold"
                        : "bg-ccb-surface border border-ccb-border text-ccb-muted hover:border-ccb-primary/40"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
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

              {/* Pagination */}
              {usersTotal > USER_PAGE_SIZE && (
                <div className="flex items-center justify-between pt-2">
                  <div className="text-xs text-ccb-muted">
                    Showing {userPage * USER_PAGE_SIZE + 1}–{Math.min((userPage + 1) * USER_PAGE_SIZE, usersTotal)} of {usersTotal}
                  </div>
                  <div className="flex gap-2">
                    <ActionButton
                      onClick={() => setUserPage((p) => Math.max(0, p - 1))}
                      loading={false}
                      variant="default"
                    >
                      Previous
                    </ActionButton>
                    <ActionButton
                      onClick={() => setUserPage((p) => p + 1)}
                      loading={false}
                      variant="default"
                    >
                      Next
                    </ActionButton>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* WITHDRAWALS */}
          {tab === "withdrawals" && (
            <WithdrawalsPanel
              withdrawals={withdrawals}
              withdrawalFilter={withdrawalFilter}
              setWithdrawalFilter={setWithdrawalFilter}
              withdrawalSearch={withdrawalSearch}
              setWithdrawalSearch={setWithdrawalSearch}
              withdrawalConfig={withdrawalConfig}
              setWithdrawalConfig={setWithdrawalConfig}
              withdrawalConfigSaving={withdrawalConfigSaving}
              setWithdrawalConfigSaving={setWithdrawalConfigSaving}
              financeConfigSaving={financeConfigSaving}
              setFinanceConfigSaving={setFinanceConfigSaving}
              rejectReason={rejectReason}
              setRejectReason={setRejectReason}
              rejectingId={rejectingId}
              setRejectingId={setRejectingId}
              actionLoading={actionLoading}
              configEdit={configEdit}
              setConfigEdit={setConfigEdit}
              handleApprove={handleApprove}
              handleRejectWithReason={handleRejectWithReason}
              handleSaveFinanceConfig={handleSaveFinanceConfig}
              handleToggleAutoApprove={handleToggleAutoApprove}
              formatMWK={formatMWK}
              formatDate={formatDate}
            />
          )}

          {tab === "tournaments" && (
            <TournamentsPanel
              tournaments={tournaments}
              tournamentStats={tournamentStats}
              tournamentFilter={tournamentFilter}
              setTournamentFilter={setTournamentFilter}
              tournamentSearch={tournamentSearch}
              setTournamentSearch={setTournamentSearch}
              editingTournament={editingTournament}
              setEditingTournament={setEditingTournament}
              editForm={editForm}
              setEditForm={setEditForm}
              prizeEditTournament={prizeEditTournament}
              setPrizeEditTournament={setPrizeEditTournament}
              prizeForm={prizeForm}
              setPrizeForm={setPrizeForm}
              creatingTournament={creatingTournament}
              setCreatingTournament={setCreatingTournament}
              createForm={createForm}
              setCreateForm={setCreateForm}
              managingTournament={managingTournament}
              setManagingTournament={setManagingTournament}
              tournamentDetail={tournamentDetail}
              setTournamentDetail={setTournamentDetail}
              detailLoading={detailLoading}
              actionLoading={actionLoading}
              handleTournamentAction={handleTournamentAction}
              handleTournamentEdit={handleTournamentEdit}
              saveTournamentEdit={saveTournamentEdit}
              handleTournamentDelete={handleTournamentDelete}
              handleTournamentDuplicate={handleTournamentDuplicate}
              handleTournamentShare={handleTournamentShare}
              handlePrizeEdit={handlePrizeEdit}
              savePrizeEdit={savePrizeEdit}
              handleCreateTournament={handleCreateTournament}
              fetchTournamentDetail={fetchTournamentDetail}
              handleAdminTournamentAction={handleAdminTournamentAction}
              updatePrizePayout={updatePrizePayout}
              formatMWK={formatMWK}
              formatDate={formatDate}
            />
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
                    <div key={g.id} className="card">
                      <div className="flex items-center justify-between">
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
                            g.status === "aborted" || g.status === "abort" ? "bg-ccb-danger/10 text-ccb-danger" :
                            "bg-ccb-surface text-ccb-muted"
                          }`}>{g.status === "abort" ? "aborted" : g.status}</span>
                          {g.winner && <span className="text-xs text-ccb-muted">{g.winner} won</span>}
                        </div>
                      </div>
                      {/* Action buttons */}
                      {(g.status === "playing" || g.status === "completed" || g.status === "draw") && (
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-ccb-border">
                          {g.status === "playing" && (
                            <button
                              onClick={() => handleGameAbort(g.id)}
                              disabled={actionLoading === g.id}
                              className="text-xs px-2 py-1 rounded bg-ccb-danger/10 text-ccb-danger hover:bg-ccb-danger/20 disabled:opacity-50"
                            >
                              {actionLoading === g.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Abort"}
                            </button>
                          )}
                          <button
                            onClick={() => setOverrideGame(g)}
                            disabled={actionLoading === g.id}
                            className="text-xs px-3 py-1.5 rounded-lg bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/20 hover:bg-ccb-primary/20 disabled:opacity-50 font-semibold"
                          >
                            {actionLoading === g.id ? <Loader2 className="w-3 h-3 animate-spin" /> : (g.status === "completed" || g.status === "draw") ? "Correct Result" : "Set Result"}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DEPOSITS */}

          {tab === "deposits" && (
            <DepositsPanel
              deposits={deposits}
              depositFilter={depositFilter}
              setDepositFilter={setDepositFilter}
              depositSearch={depositSearch}
              setDepositSearch={setDepositSearch}
              actionLoading={actionLoading}
              creditingId={creditingId}
              setCreditingId={setCreditingId}
              creditNotes={creditNotes}
              setCreditNotes={setCreditNotes}
              handleVerifyDeposit={handleVerifyDeposit}
              handleRejectDeposit={handleRejectDeposit}
              handleCreditWithNotes={handleCreditWithNotes}
              formatMWK={formatMWK}
              formatDate={formatDate}
            />
          )}

          {tab === "battles" && (
          <BattlesAdminPanel formatMWK={formatMWK} formatDate={formatDate} />
        )}

        {/* INTEGRITY / ANTI-CHEAT */}
          {tab === "integrity" && (
          <IntegrityPanel
            flags={integrityFlags}
            loading={integrityLoading}
            scanLoading={scanLoading}
            scanResult={scanResult}
            onScan={runIntegrityScan}
            onAction={handleIntegrityAction}
            actionLoading={integrityActionLoading}
            formatDate={formatDate}
          />
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
              <LeaguesAdminPanel />
              <div className="pt-2">
                <PlatformSettingsPanel section="leagues_xp" />
              </div>
            </div>
          )}

        </>
      )}

          {/* VERIFICATION */}
          {tab === "verification" && (
            <div className="space-y-4">
              <PlatformSettingsPanel section="verification" />
              <div className="card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-ccb-primary" />
                    <h3 className="text-sm font-bold">Document verification queue</h3>
                    {kycSubmissions.length > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500">{kycSubmissions.length} pending</span>}
                  </div>
                  <button onClick={fetchKycSubmissions} className="text-xs text-ccb-muted hover:text-ccb-text">Refresh</button>
                </div>
                {kycLoading ? (
                  <div className="py-6 text-center"><Loader2 className="w-5 h-5 mx-auto text-ccb-muted animate-spin" /></div>
                ) : kycSubmissions.length === 0 ? (
                  <p className="text-xs text-ccb-muted py-2">No ID documents awaiting review.</p>
                ) : (
                  kycSubmissions.map((k) => (
                    <div key={k.id} className="rounded-xl border border-ccb-border p-3 mb-3 space-y-2">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                          <p className="text-sm font-bold">{k.player?.display_name || k.player?.username || "Player"}</p>
                          <p className="text-xs text-ccb-muted">{k.player?.email}{k.player?.phone ? ` · ${k.player.phone}` : ""}</p>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ccb-surface text-ccb-muted">
                          {k.doc_type === "national_id" ? "National ID" : k.doc_type === "passport" ? "Passport" : "Driver's Licence"} · ••••{String(k.doc_number || "").slice(-4)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {k.docUrl && <a href={k.docUrl} target="_blank" rel="noreferrer" className="text-xs text-ccb-primary underline">View document</a>}
                        {k.selfieUrl && <a href={k.selfieUrl} target="_blank" rel="noreferrer" className="text-xs text-ccb-primary underline">View selfie</a>}
                        <span className="text-xs text-ccb-muted">submitted {new Date(k.created_at).toLocaleString()}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ActionButton onClick={() => reviewKyc(k.id, "approve")} loading={actionLoading === k.id} variant="success">Approve</ActionButton>
                        <ActionButton onClick={() => reviewKyc(k.id, "reject")} loading={actionLoading === k.id} variant="danger">Reject</ActionButton>
                      </div>
                    </div>
                  ))
                )}
              </div>
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

      <ResultOverrideModal
        game={overrideGame}
        onClose={() => setOverrideGame(null)}
        onConfirm={handleOverrideConfirm}
      />
    </div>
  );
}


