"use client";

import { useState, useEffect } from "react";
import {
  Loader2, X, Wallet, Trophy, Gamepad2, ArrowDownLeft, ArrowUpRight, Ban,
  Shield, Star, DollarSign, Trash2, Swords, Gift, Calendar,
  TrendingUp, TrendingDown, CheckCircle, XCircle, Clock,
  ShieldCheck, UserRound, ChevronRight, ScrollText,
} from "lucide-react";

interface UserDetailModalProps {
  userId: string;
  onClose: () => void;
  onAction: (userId: string, action: string, value?: any) => void;
  onDelete: (userId: string, username: string) => void;
  actionLoading: string | null;
  formatMWK: (n: number) => string;
}

export default function UserDetailModal({ userId, onClose, onAction, onDelete, actionLoading, formatMWK }: UserDetailModalProps) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<"overview" | "games" | "wallet" | "battles" | "tournaments" | "history">("overview");

  useEffect(() => {
    fetchUserDetail();
  }, [userId]);

  const fetchUserDetail = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/overview`);
      if (!res.ok) throw new Error("Failed to load user details");
      const json = await res.json();
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-ccb-surface rounded-2xl p-8 flex flex-col items-center gap-3" onClick={e => e.stopPropagation()}>
          <Loader2 className="w-8 h-8 animate-spin text-ccb-primary" />
          <p className="text-sm text-ccb-muted">Loading user details…</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
        <div className="bg-ccb-surface rounded-2xl p-8 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
          <p className="text-sm text-ccb-danger text-center">{error || "User not found"}</p>
          <button onClick={onClose} className="mt-4 w-full px-4 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm">Close</button>
        </div>
      </div>
    );
  }

  const p = data.profile;
  const winRate = p.games_played > 0 ? ((p.wins / p.games_played) * 100).toFixed(1) : "0";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-ccb-surface rounded-t-2xl sm:rounded-2xl max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-ccb-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-ccb-primary/10 border border-ccb-border flex items-center justify-center">
              <span className="text-lg font-bold text-ccb-primary">
                {(p.display_name || p.username || "?").charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold">{p.display_name || p.username}</h2>
                {p.is_admin && <span className="text-xs px-1.5 py-0.5 rounded bg-ccb-primary/20 text-ccb-primary font-bold">ADMIN</span>}
                {p.is_banned && <span className="text-xs px-1.5 py-0.5 rounded bg-ccb-danger/20 text-ccb-danger font-bold">BANNED</span>}
                {p.identity_verified && <span className="text-xs px-1.5 py-0.5 rounded bg-ccb-success/20 text-ccb-success font-bold flex items-center gap-0.5"><ShieldCheck className="w-3 h-3" /> VERIFIED</span>}
              </div>
              <div className="text-xs text-ccb-muted mt-0.5">
                @{p.username} · {p.email} · {p.country || "Unknown"}
              </div>
              <div className="text-xs text-ccb-muted">
                Joined {new Date(p.created_at).toLocaleDateString()} · {p.phone || "No phone"}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-ccb-surface/50 text-ccb-muted hover:text-ccb-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 px-5 py-2 border-b border-ccb-border shrink-0 overflow-x-auto">
          {([
            ["overview", "Overview", UserRound],
            ["games", "Games", Gamepad2],
            ["wallet", "Wallet", Wallet],
            ["battles", "Battles", Swords],
            ["tournaments", "Tournaments", Trophy],
            ["history", "Admin History", ScrollText],
          ] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setSection(key as typeof section)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                section === key ? "bg-ccb-primary text-white" : "bg-ccb-surface text-ccb-muted hover:text-ccb-text border border-ccb-border"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto p-5 flex-1 space-y-4">
          {section === "overview" && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="card p-3">
                  <div className="text-xs text-ccb-muted">Rating</div>
                  <div className="text-lg font-bold">{p.rating || "Unrated"}</div>
                </div>
                <div className="card p-3">
                  <div className="text-xs text-ccb-muted">Games</div>
                  <div className="text-lg font-bold">{p.games_played || 0}</div>
                </div>
                <div className="card p-3">
                  <div className="text-xs text-ccb-muted">Win Rate</div>
                  <div className="text-lg font-bold">{winRate}%</div>
                </div>
                <div className="card p-3">
                  <div className="text-xs text-ccb-muted">Wallet</div>
                  <div className="text-lg font-bold text-ccb-primary">{formatMWK(p.wallet_balance || 0)}</div>
                </div>
              </div>

              <div className="card p-4">
                <div className="text-xs font-bold text-ccb-muted mb-3">RECORD</div>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5"><span className="text-ccb-success font-bold">{p.wins || 0}</span><span className="text-xs text-ccb-muted">Wins</span></div>
                  <div className="flex items-center gap-1.5"><span className="text-ccb-danger font-bold">{p.losses || 0}</span><span className="text-xs text-ccb-muted">Losses</span></div>
                  <div className="flex items-center gap-1.5"><span className="text-ccb-muted font-bold">{p.draws || 0}</span><span className="text-xs text-ccb-muted">Draws</span></div>
                  <div className="flex items-center gap-1.5 ml-auto"><Trophy className="w-3.5 h-3.5 text-ccb-primary" /><span className="text-xs text-ccb-muted">{p.tournaments_played || 0} played · {p.tournaments_won || 0} won</span></div>
                </div>
              </div>

              {p.bio && (<div className="card p-4"><div className="text-xs font-bold text-ccb-muted mb-2">BIO</div><p className="text-sm">{p.bio}</p></div>)}

              {(data.referralsMade?.length > 0 || data.referralReceived) && (
                <div className="card p-4">
                  <div className="text-xs font-bold text-ccb-muted mb-3 flex items-center gap-1.5"><Gift className="w-3.5 h-3.5" /> REFERRALS</div>
                  {data.referralReceived && (
                    <div className="flex items-center justify-between text-xs mb-2 pb-2 border-b border-ccb-border/50">
                      <span className="text-ccb-muted">Referred by: <span className="text-ccb-text font-medium">{data.referralReceived.referrer?.username || "Unknown"}</span></span>
                      <StatusBadge status={data.referralReceived.status} />
                    </div>
                  )}
                  {data.referralsMade?.map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between text-xs py-1.5">
                      <span>{r.referred?.username || "Unknown"}</span>
                      <div className="flex items-center gap-2">
                        {r.reward_amount > 0 && <span className="text-ccb-success">{formatMWK(r.reward_amount)}</span>}
                        <StatusBadge status={r.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <button onClick={() => onAction(userId, p.is_banned ? "unban" : "ban")} disabled={actionLoading === `${userId}_${p.is_banned ? "unban" : "ban"}`} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${p.is_banned ? "bg-ccb-success/10 text-ccb-success hover:bg-ccb-success/20" : "bg-ccb-danger/10 text-ccb-danger hover:bg-ccb-danger/20"}`}>
                  {actionLoading === `${userId}_${p.is_banned ? "unban" : "ban"}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Ban className="w-3.5 h-3.5" /> {p.is_banned ? "Unban" : "Ban"}</>}
                </button>
                <button onClick={() => onAction(userId, "toggle_admin", !p.is_admin)} disabled={actionLoading === `${userId}_toggle_admin`} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-ccb-primary/10 text-ccb-primary hover:bg-ccb-primary/20 disabled:opacity-50">
                  {actionLoading === `${userId}_toggle_admin` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Shield className="w-3.5 h-3.5" /> {p.is_admin ? "Remove Admin" : "Make Admin"}</>}
                </button>
                <button onClick={() => { const val = prompt("Adjust wallet (positive=credit, negative=debit, in MK):", "10"); if (val !== null) onAction(userId, "adjust_wallet", parseInt(val)); }} disabled={actionLoading === `${userId}_adjust_wallet`} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-ccb-surface text-ccb-muted hover:text-ccb-text border border-ccb-border disabled:opacity-50">
                  {actionLoading === `${userId}_adjust_wallet` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><DollarSign className="w-3.5 h-3.5" /> Wallet</>}
                </button>
                <button onClick={() => { const val = prompt("Set new rating (0-4000):", String(p.rating || 1500)); if (val !== null) onAction(userId, "adjust_rating", parseInt(val)); }} disabled={actionLoading === `${userId}_adjust_rating`} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-ccb-surface text-ccb-muted hover:text-ccb-text border border-ccb-border disabled:opacity-50">
                  {actionLoading === `${userId}_adjust_rating` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Star className="w-3.5 h-3.5" /> Rating</>}
                </button>
                <button onClick={() => onDelete(userId, p.display_name || p.username)} disabled={actionLoading === `${userId}_delete`} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-ccb-danger/10 text-ccb-danger hover:bg-ccb-danger/20 disabled:opacity-50">
                  {actionLoading === `${userId}_delete` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Trash2 className="w-3.5 h-3.5" /> Delete</>}
                </button>
              </div>
            </>
          )}

          {section === "games" && (
            <div className="space-y-2">
              {data.games.length === 0 ? <EmptyState icon={Gamepad2} text="No games played" /> : data.games.map((g: any) => {
                const isWhite = g.white_player_id === userId;
                const opponent = isWhite ? g.black_player?.username : g.white_player?.username;
                const result = g.status === "draw" ? "Draw" : (g.winner === "white" && isWhite) || (g.winner === "black" && !isWhite) ? "Win" : g.winner ? "Loss" : g.status;
                const resultColor = result === "Win" ? "text-ccb-success" : result === "Loss" ? "text-ccb-danger" : "text-ccb-muted";
                return (
                  <div key={g.id} className="card p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${isWhite ? "bg-white text-black" : "bg-gray-800 text-white"}`}>{isWhite ? "W" : "B"}</div>
                      <div>
                        <div className="text-sm font-medium">vs {opponent || "?"}</div>
                        <div className="text-xs text-ccb-muted">{g.time_control} · {g.move_count || 0} moves · {g.rated ? "Rated" : "Casual"}{g.opening ? ` · ${g.opening}` : ""}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${resultColor}`}>{result}</div>
                      <div className="text-xs text-ccb-muted">{new Date(g.created_at).toLocaleDateString()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {section === "wallet" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="card p-4 bg-gradient-to-br from-ccb-primary/10 to-transparent">
                  <div className="text-xs text-ccb-muted">CURRENT BALANCE</div>
                  <div className="text-2xl font-bold text-ccb-primary mt-1">{formatMWK(p.wallet_balance || 0)}</div>
                </div>
                <div className="card p-4">
                  <div className="text-xs text-ccb-muted">REAL CASH DEPOSITED</div>
                  <div className="text-2xl font-bold text-ccb-success mt-1">{formatMWK(data.cashDepositTotal || 0)}</div>
                  <div className="text-[10px] text-ccb-muted mt-0.5">Mobile money + card, successful only</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-bold text-ccb-muted mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" /> WALLET ACTIVITY ({data.transactions?.length || 0})
                </div>
                <div className="text-[10px] text-ccb-muted mb-2 px-0.5">
                  <span className="text-ccb-success font-semibold">Green = money in</span> (deposits, payouts, refunds) · <span className="text-ccb-danger font-semibold">Red = money out</span> (escrow, entry fees, withdrawals, admin corrections)
                </div>
                <div className="space-y-1.5">
                  {(data.transactions?.length || 0) === 0 ? <p className="text-xs text-ccb-muted px-3">No wallet activity</p> : data.transactions?.map((t: any) => {
                    const isIn = t.direction === "in";
                    const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
                    return (
                      <div key={t.id} className="card p-2.5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${isIn ? "bg-ccb-success/10 text-ccb-success" : "bg-ccb-danger/10 text-ccb-danger"}`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <div>
                            <div className="text-sm font-medium">{t.label}</div>
                            <div className="text-xs text-ccb-muted">{new Date(t.created_at).toLocaleString()}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`text-sm font-semibold ${isIn ? "text-ccb-success" : "text-ccb-danger"}`}>
                            {isIn ? "+" : ""}{formatMWK(t.display_amount)}
                          </div>
                          <StatusBadge status={t.status} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {section === "battles" && (
            <div className="space-y-2">
              {data.battles.length === 0 ? <EmptyState icon={Swords} text="No battles" /> : data.battles.map((b: any) => {
                const isWhite = b.white_player?.username === p.username;
                const opponent = isWhite ? b.black_player?.username : b.white_player?.username;
                const won = b.winner_id === userId;
                const result = b.status === "cancelled" ? "Cancelled" : b.status === "draw" ? "Draw" : won ? "Win" : b.status === "completed" ? "Loss" : b.status;
                const resultColor = won ? "text-ccb-success" : result === "Loss" ? "text-ccb-danger" : "text-ccb-muted";
                return (
                  <div key={b.id} className="card p-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">vs {opponent || "?"}</div>
                      <div className="text-xs text-ccb-muted">Stake: {formatMWK(b.stake_amount)} · {new Date(b.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className={`text-sm font-bold ${resultColor}`}>{result}</div>
                  </div>
                );
              })}
            </div>
          )}

          {section === "tournaments" && (
            <div className="space-y-2">
              {data.tournaments.length === 0 ? <EmptyState icon={Trophy} text="No tournament participations" /> : data.tournaments.map((t: any) => (
                <div key={t.id} className="card p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{t.tournament?.name || "Unknown"}</div>
                    <div className="text-xs text-ccb-muted">{t.tournament?.type} · Score: {t.score} · W{t.wins}/L{t.losses}/D{t.draws}{t.final_rank ? ` · Rank #${t.final_rank}` : ""}</div>
                  </div>
                  <StatusBadge status={t.status} />
                </div>
              ))}
            </div>
          )}

          {section === "history" && (
            <div className="space-y-2">
              {data.adminActions?.length === 0 ? <EmptyState icon={Clock} text="No admin actions on this user" /> : data.adminActions.map((a: any) => (
                <div key={a.id} className="card p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{a.action}</div>
                    <div className="text-xs text-ccb-muted">{new Date(a.created_at).toLocaleString()}</div>
                  </div>
                  <div className="text-xs text-ccb-muted mt-1">By: {a.actor?.username || "System"}{a.details && ` · ${JSON.stringify(a.details).slice(0, 100)}`}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    pending: "bg-yellow-500/10 text-yellow-600",
    approved: "bg-blue-500/10 text-blue-600",
    completed: "bg-ccb-success/10 text-ccb-success",
    success: "bg-ccb-success/10 text-ccb-success",
    active: "bg-ccb-success/10 text-ccb-success",
    rejected: "bg-ccb-danger/10 text-ccb-danger",
    failed: "bg-ccb-danger/10 text-ccb-danger",
    cancelled: "bg-ccb-muted/10 text-ccb-muted",
    withdrawn: "bg-orange-500/10 text-orange-600",
    qualified: "bg-ccb-success/10 text-ccb-success",
    expired: "bg-ccb-muted/10 text-ccb-muted",
  };
  const cls = colors[status?.toLowerCase()] || "bg-ccb-surface text-ccb-muted";
  return <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${cls}`}>{status}</span>;
}

function EmptyState({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="text-center py-8 text-ccb-muted text-sm">
      <Icon className="w-8 h-8 mx-auto mb-2 opacity-50" />
      {text}
    </div>
  );
}
