"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard, Users, ArrowDownUp, Trophy, Loader2, Check, X, Coins, Smartphone, Shield, Clock,
  TrendingUp, Wallet, AlertCircle, ChevronRight, Cherry, Gamepad2,
  Ban, Star, DollarSign, Search, Save, ScrollText, Swords,
  Menu, LogOut,
  Copy, Trash2, Edit3, Share2, Gift, Calendar,
} from "lucide-react";

interface Withdrawal {
  id: string;
  amount_cents: number;
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
  wallet_balance_cents: number;
  is_admin: boolean;
  is_banned: boolean;
  phone: string | null;
  berry_balance: number;
  created_at: string;
}

interface Deposit {
  id: string;
  user_id: string;
  amount_cents: number;
  status: string;
  method: string;
  charge_id: string | null;
  tx_ref: string | null;
  phone: string | null;
  operator: string | null;
  reference: string | null;
  created_at: string;
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
  entry_fee_cents: number;
  prize_pool_cents: number;
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

type Tab = "overview" | "users" | "withdrawals" | "tournaments" | "games" | "deposits" | "battles" | "berry" | "logs";

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
  const [withdrawalFilter, setWithdrawalFilter] = useState("pending");
  const [depositFilter, setDepositFilter] = useState("all");
  const [gamesFilter, setGamesFilter] = useState("all");
  const [battleStats, setBattleStats] = useState<any>(null);
  const [battleConfig, setBattleConfig] = useState<any>(null);
  const [battleConfigSaving, setBattleConfigSaving] = useState(false);
  const [berryConfig, setBerryConfig] = useState<any>(null);
  const [berrySaving, setBerrySaving] = useState(false);
  const [withdrawalConfig, setWithdrawalConfig] = useState<any>(null);
  const [withdrawalConfigSaving, setWithdrawalConfigSaving] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [prizeEditTournament, setPrizeEditTournament] = useState<Tournament | null>(null);
  const [prizeForm, setPrizeForm] = useState<any>(null);

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

  const fetchBerryConfig = useCallback(async () => {
    const res = await fetch("/api/admin/berry-config");
    if (res.ok) setBerryConfig(await res.json());
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
      if (tab === "berry") await fetchBerryConfig();
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
    const msg1 = "PERMANENTLY DELETE " + username + "?\n\nThis will remove ALL their data:\n- Profile, auth account, game history\n- Berry balance and transactions\n- Tournament participations\n- Battle records\n- Referrals, deposits, withdrawals\n\nThis CANNOT be undone. Are you absolutely sure?";
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
      starts_at: t.starts_at ? t.starts_at.slice(0, 16) : "",
      ends_at: t.ends_at ? t.ends_at.slice(0, 16) : "",
      entry_fee_cents: t.entry_fee_cents || 0,
      prize_pool_cents: t.prize_pool_cents || 0,
    });
  };

  const saveTournamentEdit = async () => {
    if (!editingTournament) return;
    setActionLoading(`${editingTournament.id}_edit`);
    try {
      const body: Record<string, any> = { tournamentId: editingTournament.id, action: "edit" };
      for (const [k, v] of Object.entries(editForm)) {
        if (v !== "" && v !== null) body[k] = v === "" ? null : v;
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
    if (!confirm("Permanently delete this tournament? This will refund all paid participants and remove all data. This cannot be undone.")) return;
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
    const url = `${window.location.origin}/tournaments/${t.id}`;
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

  const formatMWK = (cents: number) => `MWK ${Math.floor((cents || 0) / 100).toLocaleString()}`;
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
    { id: "berry", label: "Berry", icon: Cherry },
    { id: "logs", label: "Logs", icon: ScrollText },
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

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {tabs.map((t) => {
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
                    <div key={u.id} className={`card ${u.is_banned ? "opacity-60" : ""}`}>
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
                          <div className="text-sm font-medium">{formatMWK(u.wallet_balance_cents)}</div>
                          <div className="text-xs text-ccb-muted flex items-center gap-1 justify-end">
                            <Cherry className="w-3 h-3 text-red-500" /> {u.berry_balance || 0}
                          </div>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-ccb-border">
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
                            const val = prompt("Adjust wallet (positive=credit, negative=debit, in MWK cents):", "1000");
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
                          onClick={() => {
                            const val = prompt("Grant berries:", "100");
                            if (val !== null) handleUserAction(u.id, "grant_berries", parseInt(val));
                          }}
                          loading={actionLoading === `${u.id}_grant_berries`}
                          variant="default"
                        >
                          <Cherry className="w-3.5 h-3.5" /> Grant Berries
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
              {/* Auto-approve toggle */}
              {withdrawalConfig && (
                <div className="card flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">Auto-Approve Withdrawals</p>
                    <p className="text-xs text-ccb-muted mt-0.5">
                      {withdrawalConfig.auto_approve_enabled
                        ? "Withdrawals are processed automatically via Paychangu. No admin review needed."
                        : "Withdrawals require manual admin approval before payout is sent."}
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
              )}

              {/* Withdrawal stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="card text-center">
                  <p className="text-xs text-ccb-muted">Total Withdrawals</p>
                  <p className="text-lg font-bold mt-1">
                    {formatMWK(withdrawals.reduce((s, w) => s + (w.status === "completed" ? w.amount_cents : 0), 0))}
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-xs text-ccb-muted">Pending</p>
                  <p className="text-lg font-bold mt-1 text-ccb-accent">
                    {withdrawals.filter(w => w.status === "pending").length}
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-xs text-ccb-muted">Completed</p>
                  <p className="text-lg font-bold mt-1 text-ccb-success">
                    {withdrawals.filter(w => w.status === "completed").length}
                  </p>
                </div>
              </div>

              {/* Filters */}
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

              {withdrawals.length === 0 ? (
                <div className="text-center py-12 text-ccb-muted text-sm">
                  <ArrowDownUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No withdrawals found
                </div>
              ) : (
                <div className="space-y-2">
                  {withdrawals.map((w) => (
                    <div key={w.id} className="card">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">{formatMWK(w.amount_cents)}</span>
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
                        <div className="flex gap-2 mt-3 pt-3 border-t border-ccb-border">
                          <button
                            onClick={() => handleApprove(w.id)}
                            disabled={actionLoading === w.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-success text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                          >
                            {actionLoading === w.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Approve & Send
                          </button>
                          <button
                            onClick={() => handleReject(w.id)}
                            disabled={actionLoading === w.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-danger text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                          >
                            {actionLoading === w.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            Reject & Refund
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "tournaments" && (
            <div className="space-y-3">
              {tournaments.length === 0 ? (
                <div className="text-center py-12 text-ccb-muted text-sm">
                  <Trophy className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No tournaments found
                </div>
              ) : (
                <div className="space-y-2">
                  {tournaments.map((t) => (
                    <div key={t.id} className="card">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium flex items-center gap-2">
                            {t.name}
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              t.status === "active" ? "bg-ccb-success/10 text-ccb-success" :
                              t.status === "upcoming" ? "bg-ccb-accent/10 text-ccb-accent" :
                              t.status === "finished" ? "bg-ccb-muted/10 text-ccb-muted" :
                              t.status === "cancelled" ? "bg-ccb-danger/10 text-ccb-danger" :
                              t.status === "pending_approval" ? "bg-amber-500/10 text-amber-500" :
                              t.status === "rejected" ? "bg-red-500/10 text-red-500" :
                              "bg-ccb-surface text-ccb-muted"
                            }`}>{t.status}</span>
                          </div>
                          <div className="text-xs text-ccb-muted mt-1">
                            {t.type} · {t.time_control} · {t.participant_count}/{t.max_players ?? '∞'} players · Round {t.current_round}/{t.rounds ?? '-'}
                          </div>
                          <div className="text-xs text-ccb-muted">
                            Entry: {formatMWK(t.entry_fee_cents)} · Prize: {formatMWK(t.prize_pool_cents)}
                          </div>
                          {t.description && (
                            <div className="text-xs text-ccb-muted mt-1 line-clamp-1">{t.description}</div>
                          )}
                        </div>
                        <div className="text-xs text-ccb-muted text-right shrink-0 ml-3">
                          {formatDate(t.starts_at)}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-ccb-border">
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

                        {/* Edit — only for upcoming */}
                        {t.status === "upcoming" && (
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
                          <Share2 className="w-3.5 h-3.5" />
                          Share
                        </button>

                        {/* Cancel & Refund — upcoming or active */}
                        {(t.status === "upcoming" || t.status === "active") && (
                          <button
                            onClick={() => handleTournamentAction(t.id, "cancel")}
                            disabled={actionLoading === `${t.id}_cancel`}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-danger/90 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                          >
                            {actionLoading === `${t.id}_cancel` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            Cancel & Refund
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

                        {/* Delete — upcoming or cancelled only */}
                        {(t.status === "upcoming" || t.status === "cancelled") && (
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

              {/* Edit Tournament Modal */}
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
                        <input
                          value={editForm.name || ""}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="input-field mt-1 w-full"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-ccb-muted">Description</label>
                        <textarea
                          value={editForm.description || ""}
                          onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                          className="input-field mt-1 w-full"
                          rows={2}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-ccb-muted">Type</label>
                          <select
                            value={editForm.type || "swiss"}
                            onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                            className="input-field mt-1 w-full"
                          >
                            <option value="swiss">Swiss</option>
                            <option value="arena">Arena</option>
                            <option value="knockout">Knockout</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-ccb-muted">Time Control</label>
                          <select
                            value={editForm.time_control || "blitz"}
                            onChange={(e) => setEditForm({ ...editForm, time_control: e.target.value })}
                            className="input-field mt-1 w-full"
                          >
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
                          <input
                            type="number"
                            value={editForm.initial_minutes ?? ""}
                            onChange={(e) => setEditForm({ ...editForm, initial_minutes: e.target.value })}
                            className="input-field mt-1 w-full"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-ccb-muted">Increment (sec)</label>
                          <input
                            type="number"
                            value={editForm.increment_seconds ?? ""}
                            onChange={(e) => setEditForm({ ...editForm, increment_seconds: e.target.value })}
                            className="input-field mt-1 w-full"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-ccb-muted">Max Players (blank = ∞)</label>
                          <input
                            type="number"
                            value={editForm.max_players ?? ""}
                            onChange={(e) => setEditForm({ ...editForm, max_players: e.target.value })}
                            className="input-field mt-1 w-full"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-ccb-muted">Rounds</label>
                          <input
                            type="number"
                            value={editForm.rounds ?? ""}
                            onChange={(e) => setEditForm({ ...editForm, rounds: e.target.value })}
                            className="input-field mt-1 w-full"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-ccb-muted">Min Rating</label>
                          <input
                            type="number"
                            value={editForm.min_rating ?? 0}
                            onChange={(e) => setEditForm({ ...editForm, min_rating: e.target.value })}
                            className="input-field mt-1 w-full"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-ccb-muted">Max Rating (blank = none)</label>
                          <input
                            type="number"
                            value={editForm.max_rating ?? ""}
                            onChange={(e) => setEditForm({ ...editForm, max_rating: e.target.value })}
                            className="input-field mt-1 w-full"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-ccb-muted">Start Time</label>
                        <input
                          type="datetime-local"
                          value={editForm.starts_at || ""}
                          onChange={(e) => setEditForm({ ...editForm, starts_at: e.target.value })}
                          className="input-field mt-1 w-full"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-ccb-muted">End Time (optional)</label>
                        <input
                          type="datetime-local"
                          value={editForm.ends_at || ""}
                          onChange={(e) => setEditForm({ ...editForm, ends_at: e.target.value })}
                          className="input-field mt-1 w-full"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-medium text-ccb-muted">Entry Fee (MK cents)</label>
                          <input
                            type="number"
                            value={editForm.entry_fee_cents ?? 0}
                            onChange={(e) => setEditForm({ ...editForm, entry_fee_cents: e.target.value })}
                            className="input-field mt-1 w-full"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-ccb-muted">Prize Pool (MK cents)</label>
                          <input
                            type="number"
                            value={editForm.prize_pool_cents ?? 0}
                            onChange={(e) => setEditForm({ ...editForm, prize_pool_cents: e.target.value })}
                            className="input-field mt-1 w-full"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={saveTournamentEdit}
                        disabled={actionLoading === `${editingTournament.id}_edit`}
                        className="flex items-center gap-1 px-4 py-2 rounded-lg bg-ccb-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        {actionLoading === `${editingTournament.id}_edit` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Changes
                      </button>
                      <button
                        onClick={() => setEditingTournament(null)}
                        className="px-4 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted text-sm font-medium hover:bg-ccb-muted/10"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Edit Prize Distribution Modal */}
              {prizeEditTournament && prizeForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                  <div className="bg-ccb-card rounded-xl border border-ccb-border max-w-md w-full max-h-[85vh] overflow-y-auto p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold">Edit Prize Distribution</h3>
                      <button onClick={() => setPrizeEditTournament(null)} className="text-ccb-muted hover:text-ccb-fg">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <p className="text-xs text-ccb-muted">Prize pool: {formatMWK(prizeEditTournament.prize_pool_cents)}</p>

                    <div>
                      <label className="text-xs font-medium text-ccb-muted">Distribution Type</label>
                      <select
                        value={prizeForm.type || "percentage"}
                        onChange={(e) => setPrizeForm({ ...prizeForm, type: e.target.value })}
                        className="input-field mt-1 w-full"
                      >
                        <option value="percentage">Percentage of pool</option>
                        <option value="flat">Fixed amount per rank</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-ccb-muted">Payouts</label>
                      {prizeForm.payouts?.map((payout: any, i: number) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-ccb-muted w-8">#{payout.rank}</span>
                          <input
                            type="number"
                            value={prizeForm.type === "flat" ? payout.amount_cents ?? 0 : payout.percentage ?? 0}
                            onChange={(e) => updatePrizePayout(i, prizeForm.type === "flat" ? "amount_cents" : "percentage", Number(e.target.value))}
                            className="input-field flex-1"
                            placeholder={prizeForm.type === "flat" ? "Amount (cents)" : "Percentage (%)"}
                          />
                          {prizeForm.type === "percentage" && (
                            <span className="text-xs text-ccb-muted w-20 text-right">
                              = {formatMWK(Math.floor((prizeEditTournament.prize_pool_cents * (payout.percentage || 0)) / 100))}
                            </span>
                          )}
                          <button
                            onClick={() => removePrizePayout(i)}
                            className="text-ccb-danger hover:bg-ccb-danger/10 p-1 rounded"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={addPrizePayout}
                        className="text-xs text-ccb-primary hover:underline flex items-center gap-1"
                      >
                        + Add payout tier
                      </button>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={savePrizeEdit}
                        disabled={actionLoading === `${prizeEditTournament.id}_edit_prizes`}
                        className="flex items-center gap-1 px-4 py-2 rounded-lg bg-ccb-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
                      >
                        {actionLoading === `${prizeEditTournament.id}_edit_prizes` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        Save Prizes
                      </button>
                      <button
                        onClick={() => setPrizeEditTournament(null)}
                        className="px-4 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-ccb-muted text-sm font-medium hover:bg-ccb-muted/10"
                      >
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
              {/* Deposit stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="card text-center">
                  <p className="text-xs text-ccb-muted">Total Deposits</p>
                  <p className="text-lg font-bold mt-1">
                    {formatMWK(deposits.reduce((s, d) => s + (d.status === "success" ? d.amount_cents : 0), 0))}
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-xs text-ccb-muted">Pending</p>
                  <p className="text-lg font-bold mt-1 text-ccb-accent">
                    {deposits.filter(d => d.status === "pending").length}
                  </p>
                </div>
                <div className="card text-center">
                  <p className="text-xs text-ccb-muted">Successful</p>
                  <p className="text-lg font-bold mt-1 text-ccb-success">
                    {deposits.filter(d => d.status === "success").length}
                  </p>
                </div>
              </div>

              {/* Filters */}
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

              {deposits.length === 0 ? (
                <div className="text-center py-12 text-ccb-muted text-sm">
                  <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  No deposits found
                </div>
              ) : (
                <div className="space-y-2">
                  {deposits.map((d) => (
                    <div key={d.id} className="card">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{formatMWK(d.amount_cents)}</span>
                            <span className={`text-xs px-2 py-0.5 rounded ${
                              d.status === "success" ? "bg-ccb-success/10 text-ccb-success" :
                              d.status === "pending" ? "bg-ccb-accent/10 text-ccb-accent" :
                              d.status === "processing" ? "bg-ccb-primary/10 text-ccb-primary" :
                              d.status === "failed" ? "bg-ccb-danger/10 text-ccb-danger" :
                              "bg-ccb-surface text-ccb-muted"
                            }`}>{d.status}</span>
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
                              {d.charge_id ? ` · ${d.charge_id.slice(0, 20)}...` : d.tx_ref ? ` · ${d.tx_ref.slice(0, 20)}...` : ""}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Action buttons for pending/processing deposits */}
                      {(d.status === "pending" || d.status === "processing") && (
                        <div className="flex gap-2 mt-3 pt-3 border-t border-ccb-border">
                          <button
                            onClick={() => handleVerifyDeposit(d.id)}
                            disabled={actionLoading === `${d.id}_verify`}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-primary text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                          >
                            {actionLoading === `${d.id}_verify` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                            Verify
                          </button>
                          <button
                            onClick={() => handleCreditDeposit(d.id)}
                            disabled={actionLoading === `${d.id}_credit`}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-success text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                          >
                            {actionLoading === `${d.id}_credit` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Manual Credit
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
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "battles" && (
            <div className="space-y-4">
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
                        Stake Levels (MWK cents, comma-separated)
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
                        placeholder="50000, 100000, 250000, 500000, 1000000"
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
                          <span className="font-medium">{formatMWK(b.stake_cents)}</span>
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

          {/* BERRY CONFIG */}
          {tab === "berry" && berryConfig && (
            <div className="space-y-4">
              <div className="card space-y-4">
                <div className="flex items-center gap-2">
                  <Cherry className="w-5 h-5 text-red-500" />
                  <h3 className="font-medium">CRAZYCHESSBERRY Settings</h3>
                </div>

                <ConfigInput
                  label="Berries per Win"
                  value={berryConfig.berries_per_win ?? 10}
                  onChange={(v) => setBerryConfig({ ...berryConfig, berries_per_win: v })}
                />
                <ConfigInput
                  label="Berries per Draw"
                  value={berryConfig.berries_per_draw ?? 2}
                  onChange={(v) => setBerryConfig({ ...berryConfig, berries_per_draw: v })}
                />
                <ConfigInput
                  label="Berry Value (MWK cents per 100 berries)"
                  value={berryConfig.berry_value_cents ?? 1000}
                  onChange={(v) => setBerryConfig({ ...berryConfig, berry_value_cents: v })}
                />
                <p className="text-xs text-ccb-muted">100 berries = MWK {(berryConfig.berry_value_cents ?? 1000) / 100}</p>
                <ConfigInput
                  label="Minimum Redemption (berries)"
                  value={berryConfig.min_redemption ?? 1000}
                  onChange={(v) => setBerryConfig({ ...berryConfig, min_redemption: v })}
                />

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={berryConfig.enabled ?? true}
                    onChange={(e) => setBerryConfig({ ...berryConfig, enabled: e.target.checked })}
                    className="w-4 h-4 rounded"
                  />
                  <label className="text-sm">Berry earning enabled</label>
                </div>

                <button
                  onClick={async () => {
                    setBerrySaving(true);
                    try {
                      const res = await fetch("/api/admin/berry-config", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(berryConfig),
                      });
                      if (res.ok) {
                        const updated = await res.json();
                        setBerryConfig(updated);
                        showToast("Berry config saved");
                      } else {
                        const data = await res.json();
                        alert(data.error || "Failed to save");
                      }
                    } catch (e) {
                      alert("Failed to save");
                    } finally {
                      setBerrySaving(false);
                    }
                  }}
                  disabled={berrySaving}
                  className="w-full py-2.5 rounded-lg bg-ccb-primary text-white text-sm font-medium hover:bg-ccb-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {berrySaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Berry Config
                </button>
              </div>
            </div>
          )}

          {/* ADMIN LOGS */}
          {tab === "logs" && (
            <div className="space-y-2">
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
        </>
      )}
        </div>
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
