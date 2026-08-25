"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Cherry, Flame, Share2, MessageCircle, Gamepad2, User, Check, Loader2, Gift, Copy, Users, Trophy, Coins, Wallet } from "lucide-react";

interface Props {
  berryBalance: number;
  userId: string;
  hasPlayedGame: boolean;
  profileComplete: boolean;
  initialClaimedActions: string[];
}

interface RewardTask {
  id: string;
  icon: any;
  title: string;
  desc: string;
  berries: number;
  type: "one-time" | "daily" | "recurring";
  action?: string;
  claimable: boolean;
  claimed?: boolean;
  loading?: boolean;
  requirementMet?: boolean;
  ctaLabel?: string;
  onCta?: () => void;
}

export default function EarnClient({ berryBalance, userId, hasPlayedGame, profileComplete, initialClaimedActions }: Props) {
  const router = useRouter();
  const [checkinStatus, setCheckinStatus] = useState({ checkedInToday: false, currentStreak: 0 });
  const [claimedActions, setClaimedActions] = useState<Set<string>>(new Set(initialClaimedActions));
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [referralCode, setReferralCode] = useState("");
  const [referralStats, setReferralStats] = useState({ total: 0, completed: 0, pending: 0, berriesEarned: 0 });
  const [referrals, setReferrals] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [config, setConfig] = useState<any>({});

  const fetchStatus = useCallback(async () => {
    try {
      const [checkinRes, referralRes] = await Promise.all([
        fetch("/api/berry/daily-checkin"),
        fetch("/api/berry/referral"),
      ]);

      if (checkinRes.ok) {
        const checkinData = await checkinRes.json();
        setCheckinStatus({
          checkedInToday: checkinData.checkedInToday,
          currentStreak: checkinData.currentStreak,
        });
        setConfig(checkinData.config || {});
      }

      if (referralRes.ok) {
        const referralData = await referralRes.json();
        setReferralCode(referralData.referralCode || "");
        setReferralStats(referralData.stats || { total: 0, completed: 0, berriesEarned: 0 });
        setReferrals(referralData.referrals || []);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const showMessage = (type: "success" | "error", text: string) => {
    setMessages({ type, text });
    setTimeout(() => setMessages(null), 4000);
  };

  const handleCheckin = async () => {
    setLoading({ ...loading, checkin: true });
    try {
      const res = await fetch("/api/berry/daily-checkin", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        showMessage("error", data.error || "Check-in failed");
      } else {
        showMessage("success", data.message);
        setCheckinStatus({ checkedInToday: true, currentStreak: data.streak });
        window.location.reload();
      }
    } catch {
      showMessage("error", "Check-in failed");
    } finally {
      setLoading({ ...loading, checkin: false });
    }
  };

  const handleClaim = async (action: string) => {
    setLoading({ ...loading, [action]: true });
    try {
      const res = await fetch("/api/berry/engage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.alreadyClaimed) {
          setClaimedActions(new Set([...claimedActions, action]));
        }
        showMessage("error", data.error || "Failed to claim");
      } else {
        showMessage("success", data.message);
        setClaimedActions(new Set([...claimedActions, action]));
        setTimeout(() => window.location.reload(), 2000);
      }
    } catch {
      showMessage("error", "Failed to claim reward");
    } finally {
      setLoading({ ...loading, [action]: false });
    }
  };

  const handleShare = async (platform: "whatsapp" | "copy") => {
    const shareUrl = `https://crazychessbattles.live/signup?ref=${encodeURIComponent(referralCode)}`;
    const shareText = `🏆 I'm playing chess on Crazy Chess Battles! Join me and earn CCB berries → ${shareUrl}`;

    if (platform === "whatsapp") {
      window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
    } else {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleWhatsAppStatus = async () => {
    const shareUrl = `https://crazychessbattles.live/signup?ref=${encodeURIComponent(referralCode)}`;
    const statusText = `🏆 Playing chess on Crazy Chess Battles! Join & earn CCB berries → ${shareUrl}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(statusText)}`, "_blank");
    await handleClaim("whatsapp_status");
  };

  // "Share the App" — trigger the actual share action first, then claim.
  // Uses the native Web Share sheet where available, otherwise falls back to WhatsApp.
  const handleShareApp = async () => {
    const shareUrl = `https://crazychessbattles.live/signup?ref=${encodeURIComponent(referralCode)}`;
    const shareText = `🏆 I'm playing chess on Crazy Chess Battles! Join me and earn CCB berries → ${shareUrl}`;

    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({ title: "Crazy Chess Battles", text: shareText });
      } else {
        window.open(`https://wa.me/?text=${encodeURIComponent(shareText)}`, "_blank");
      }
    } catch {
      // User cancelled the share sheet — don't claim the reward.
      return;
    }
    await handleClaim("share_app");
  };

  const tasks: RewardTask[] = [
    {
      id: "daily",
      icon: Flame,
      title: "Daily Check-in",
      desc: `Visit the app every day to earn berries. Current streak: ${checkinStatus.currentStreak} days 🔥`,
      berries: config.berry_daily_login || 5,
      type: "daily",
      claimable: !checkinStatus.checkedInToday,
    },
    {
      id: "share_app",
      icon: Share2,
      title: "Share the App",
      desc: "Share Crazy Chess Battles with your friends on any platform",
      berries: config.berry_share_app || 15,
      type: "one-time",
      action: "share_app",
      claimable: !claimedActions.has("share_app"),
      claimed: claimedActions.has("share_app"),
      requirementMet: true, // sharing IS the action — Claim triggers the share sheet
      ctaLabel: "Share",
      onCta: handleShareApp,
    },
    {
      id: "whatsapp_status",
      icon: MessageCircle,
      title: "Post WhatsApp Status",
      desc: "Post about CCB on your WhatsApp status and earn berries",
      berries: config.berry_whatsapp_status || 20,
      type: "one-time",
      action: "whatsapp_status",
      claimable: !claimedActions.has("whatsapp_status"),
      claimed: claimedActions.has("whatsapp_status"),
      requirementMet: true, // posting IS the action — Claim opens WhatsApp
      ctaLabel: "Post",
      onCta: handleWhatsAppStatus,
    },
    {
      id: "first_game",
      icon: Gamepad2,
      title: "Play Your First Game",
      desc: hasPlayedGame
        ? "Complete your first ever chess game on CCB"
        : "You haven't played a game yet — tap to jump into Play and finish one",
      berries: config.berry_first_game || 10,
      type: "one-time",
      action: "first_game",
      claimable: !claimedActions.has("first_game"),
      claimed: claimedActions.has("first_game"),
      requirementMet: hasPlayedGame,
      ctaLabel: hasPlayedGame ? "Claim" : "Play Now",
      onCta: hasPlayedGame ? () => handleClaim("first_game") : () => router.push("/play"),
    },
    {
      id: "profile_complete",
      icon: User,
      title: "Complete Your Profile",
      desc: profileComplete
        ? "Add a username, display name, and avatar to your profile"
        : "Your profile is missing a username, display name, or avatar — tap to finish it",
      berries: config.berry_profile_complete || 5,
      type: "one-time",
      action: "profile_complete",
      claimable: !claimedActions.has("profile_complete"),
      claimed: claimedActions.has("profile_complete"),
      requirementMet: profileComplete,
      ctaLabel: profileComplete ? "Claim" : "Complete Profile",
      onCta: profileComplete ? () => handleClaim("profile_complete") : () => router.push("/settings"),
    },
  ];

  const streakMilestones = [
    { days: 3, berries: config.berry_streak_3day || 5 },
    { days: 7, berries: config.berry_streak_7day || 10 },
    { days: 14, berries: config.berry_streak_14day || 20 },
    { days: 30, berries: config.berry_streak_30day || 50 },
  ];

  const statusLabels: Record<string, string> = {
    pending: "Pending — waiting for activation",
    signed_up: "Signed up — not yet active",
    activated: "Activated — reward pending",
    rewarded: "✅ Rewarded — 1000 CCB",
  };

  return (
    <div className="space-y-4 sm:space-y-6 max-w-2xl mx-auto pb-20 sm:pb-0">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <Gift className="w-6 h-6 text-red-500" />
          Earn CRAZYCHESSBERRY
        </h1>
        <p className="text-sm text-ccb-muted mt-1">
          Complete tasks to earn CCB 🍒 — redeem for cash in your wallet
        </p>
      </div>

      {/* Balance */}
      <div className="card bg-gradient-to-br from-red-500/10 to-ccb-surface border-red-500/20 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-ccb-muted uppercase tracking-wide flex items-center gap-1">
              <Cherry className="w-3 h-3 text-red-500" /> Your CCB Balance
            </p>
            <p className="text-3xl font-bold mt-1">{berryBalance.toLocaleString()} 🍒</p>
            <p className="text-xs text-ccb-muted">≈ MWK {(berryBalance * 0.5).toLocaleString()}</p>
          </div>
          <a href="/wallet" className="px-4 py-2 rounded-lg bg-ccb-primary text-white text-sm font-medium hover:bg-ccb-primary/90">
            Wallet
          </a>
        </div>
      </div>

      {/* Message */}
      {messages && (
        <div className={`rounded-lg px-4 py-3 text-sm flex items-center gap-2 ${
          messages.type === "success"
            ? "bg-green-500/10 border border-green-500/30 text-green-600"
            : "bg-red-500/10 border border-red-500/30 text-red-500"
        }`}>
          {messages.type === "success" ? <Check className="w-4 h-4 shrink-0" /> : null}
          {messages.text}
        </div>
      )}

      {/* Referral Card — the big one */}
      <div className="card border-2 border-ccb-primary/30 bg-gradient-to-br from-ccb-primary/5 to-ccb-surface p-5 space-y-4">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-ccb-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-ccb-primary" />
          </div>
          <div>
            <h2 className="font-bold text-lg">Refer & Earn MK500</h2>
            <p className="text-xs text-ccb-muted">Get 1,000 CCB (≈ MK500) for each active referral</p>
          </div>
        </div>

        {/* Referral code */}
        <div className="flex items-center gap-2">
          <div className="flex-1 px-4 py-3 rounded-lg bg-ccb-dark border border-ccb-border font-mono text-sm">
            {referralCode || "Loading..."}
          </div>
          <button
            onClick={() => handleShare("copy")}
            className="px-3 py-3 rounded-lg bg-ccb-surface border border-ccb-border hover:bg-ccb-border/50"
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={() => handleShare("whatsapp")}
            className="px-3 py-3 rounded-lg bg-green-500 text-white hover:bg-green-600"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Activation conditions */}
        <div className="rounded-lg bg-ccb-surface/50 p-3 space-y-2">
          <p className="text-xs font-medium text-ccb-muted">Reward activates when your referral:</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5"><Gamepad2 className="w-3.5 h-3.5 text-ccb-primary" /> Plays 10 quick matches</div>
            <div className="flex items-center gap-1.5"><Coins className="w-3.5 h-3.5 text-ccb-primary" /> Plays 1 chess battle</div>
            <div className="flex items-center gap-1.5"><Trophy className="w-3.5 h-3.5 text-ccb-primary" /> Joins a tournament</div>
            <div className="flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5 text-ccb-primary" /> Tops up wallet</div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <p className="text-2xl font-bold">{referralStats.total}</p>
            <p className="text-xs text-ccb-muted">Total</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-ccb-primary">{referralStats.completed}</p>
            <p className="text-xs text-ccb-muted">Rewarded</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-orange-500">{referralStats.pending}</p>
            <p className="text-xs text-ccb-muted">Pending</p>
          </div>
        </div>

        {/* Referral list */}
        {referrals.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-ccb-muted">Your referrals:</p>
            {referrals.slice(0, 5).map((r: any) => (
              <div key={r.id} className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-ccb-surface/50">
                <span className="text-ccb-muted">
                  {r.quick_matches_played > 0 ? `${r.quick_matches_played}/10 matches` : "Waiting"}
                </span>
                <span className={r.status === "rewarded" ? "text-green-500 font-medium" : "text-orange-500"}>
                  {statusLabels[r.status] || r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Daily Check-in */}
      <div className={`card p-4 ${checkinStatus.checkedInToday ? "opacity-60" : "border-ccb-primary/30"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              checkinStatus.checkedInToday ? "bg-green-500/10" : "bg-orange-500/10"
            }`}>
              {checkinStatus.checkedInToday ? (
                <Check className="w-6 h-6 text-green-500" />
              ) : (
                <Flame className="w-6 h-6 text-orange-500" />
              )}
            </div>
            <div>
              <p className="font-medium">Daily Check-in</p>
              <p className="text-xs text-ccb-muted">
                {checkinStatus.checkedInToday
                  ? `Checked in! ${checkinStatus.currentStreak}-day streak 🔥`
                  : `Claim your daily berries — streak: ${checkinStatus.currentStreak} days`}
              </p>
            </div>
          </div>
          {!checkinStatus.checkedInToday && (
            <button
              onClick={handleCheckin}
              disabled={loading.checkin}
              className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-medium hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading.checkin ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Check in
            </button>
          )}
        </div>
        {/* Streak milestones */}
        <div className="flex gap-2 mt-3">
          {streakMilestones.map((m) => (
            <div key={m.days} className={`flex-1 text-center py-2 rounded-lg text-xs ${
              checkinStatus.currentStreak >= m.days ? "bg-green-500/10 text-green-600" : "bg-ccb-surface text-ccb-muted"
            }`}>
              <p className="font-bold">{m.days}d</p>
              <p className="text-[10px]">+{m.berries} 🍒</p>
            </div>
          ))}
        </div>
      </div>

      {/* One-time tasks */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-ccb-muted px-1">One-time Rewards</h3>
        {tasks.filter(t => t.type === "one-time").map((task) => {
          const Icon = task.icon;
          const needsAction = task.requirementMet === false && !task.claimed;
          return (
            <div key={task.id} className="card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  task.claimed ? "bg-green-500/10" : needsAction ? "bg-orange-500/10" : "bg-ccb-primary/10"
                }`}>
                  {task.claimed ? (
                    <Check className="w-5 h-5 text-green-500" />
                  ) : (
                    <Icon className={`w-5 h-5 ${needsAction ? "text-orange-500" : "text-ccb-primary"}`} />
                  )}
                </div>
                <div>
                  <p className="font-medium text-sm">{task.title}</p>
                  <p className="text-xs text-ccb-muted">{task.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-red-500">+{task.berries} 🍒</span>
                {task.claimable && !task.claimed && task.action && (
                  <button
                    onClick={() => task.onCta?.()}
                    disabled={loading[task.action!]}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50 ${
                      needsAction
                        ? "bg-orange-500 text-white hover:bg-orange-600"
                        : "bg-ccb-primary text-white hover:bg-ccb-primary/90"
                    }`}
                  >
                    {loading[task.action!] ? <Loader2 className="w-3 h-3 animate-spin" /> : (task.ctaLabel || "Claim")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
