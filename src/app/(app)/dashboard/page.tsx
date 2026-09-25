import type { Metadata } from "next";

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatMoneyConverted } from "@/lib/geo/server-format";
import Link from "next/link";
import { Swords, Trophy, TrendingUp, Wallet, Zap, ChevronRight, Target, Gamepad2, Crown, MessageCircle } from "lucide-react";
import WhatsAppBanner from "@/components/layout/whatsapp-banner";
import AdSlot from "@/components/ads/ad-slot";
import LiveGamesCard from "@/components/dashboard/live-games-card";
import { moneySymbol } from "@/lib/geo/format";

const LEVEL_RATINGS: Record<string, number> = {
  beginner: 400,
  intermediate: 1500,
  expert: 2500,
};


import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Dashboard — Your Chess Home",
  description: "Your Crazy Chess Battles dashboard with stats, recent games, and quick actions.",
  path: "/dashboard",
  noIndex: true
});

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // ── Active game redirect ──
  // If the user has ANY active game (free play, battle, tournament, league),
  // redirect them straight to the board — like chess.com, the only way out
  // is to resign. No turn restriction.
  const admin = createAdminClient();
  const { data: activeGame } = await admin
    .from("games")
    .select("id, status")
    .eq("status", "playing")
    .or(`white_player_id.eq.${user!.id},black_player_id.eq.${user!.id}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (activeGame) {
    redirect(`/game/${activeGame.id}`);
  }

  // Fetch profile first (needed for rating init logic)
  const { data: profile } = await supabase
    .from("profiles")
    .select("*, country")
    .eq("id", user!.id)
    .single();

  // Initialize rating based on chess level selected during signup
  const chessLevel = user?.user_metadata?.chess_level as string | undefined;
  if (chessLevel && LEVEL_RATINGS[chessLevel] && profile && profile.games_played === 0 && profile.rating !== LEVEL_RATINGS[chessLevel]) {
    const admin = createAdminClient();
    await admin.from("profiles")
      .update({ rating: LEVEL_RATINGS[chessLevel] })
      .eq("id", user!.id);
    profile.rating = LEVEL_RATINGS[chessLevel];
  }

  // Parallelize independent queries
  const [recentGamesRes, activeTournamentsRes] = await Promise.all([
    supabase
      .from("games")
      .select("id, status, winner, time_control, created_at, ended_at, white_player_id, black_player_id")
      .or(`white_player_id.eq.${user!.id},black_player_id.eq.${user!.id}`)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("tournaments")
      .select("id, name, type, status, starts_at, entry_fee")
      .eq("status", "upcoming")
      .order("starts_at", { ascending: true })
      .limit(3),
  ]);

  const recentGames = recentGamesRes.data;
  const activeTournaments = activeTournamentsRes.data;
  // Entry fees are MWK-denominated in the DB — display them converted to
  // each viewer's wallet currency (Zambians/Kenyans previously saw the raw
  // MWK number behind their local symbol, e.g. "ZK 1,000" for a ZK 11 fee).
  const tFeeLabels = await Promise.all(
    (activeTournaments || []).map(async (t: any) => [
      t.id,
      t.entry_fee ? await formatMoneyConverted(t.entry_fee, profile?.country) : null,
    ])
  );
  const feeLabelById = new Map(tFeeLabels as [string, string | null][]);

  // Fetch opponent profiles for recent games display
  const recentOpponentIds = new Set<string>();
  for (const g of recentGames || []) {
    if (g.white_player_id !== user!.id) recentOpponentIds.add(g.white_player_id);
    if (g.black_player_id !== user!.id) recentOpponentIds.add(g.black_player_id);
  }
  const { data: recentOpponents } = await supabase
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .in("id", Array.from(recentOpponentIds));
  const recentOpponentMap = new Map((recentOpponents || []).map((o) => [o.id, o]));

  const winRate = profile?.games_played
    ? Math.round(((profile.wins ?? 0) / profile.games_played) * 100)
    : 0;

  const isNewUser = (profile?.games_played ?? 0) === 0 && (profile?.wins ?? 0) === 0 && (profile?.losses ?? 0) === 0 && (profile?.draws ?? 0) === 0;

  const walletSymbol = moneySymbol(profile?.country);
  const walletBalance = profile?.wallet_balance
    ? `${walletSymbol} ${profile.wallet_balance.toLocaleString("en-US")}`
    : `${walletSymbol} 0`;

  return (
    <div className="pb-24 sm:pb-6">
      {/* Welcome — full width */}
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold">
          {isNewUser ? "Welcome to Crazy Chess Battles" : `Welcome back, ${profile?.display_name || profile?.username || "Player"}`}
        </h1>
        <p className="text-sm text-ccb-muted mt-1">
          {isNewUser ? "Let\'s get you playing — here\'s where to start." : "Ready for a battle?"}
        </p>
      </div>

      {/* Two-column desktop: main (2/3) + right rail (1/3). Mobile: single column */}
      <div className="space-y-4 sm:space-y-6 lg:grid lg:grid-cols-3 lg:gap-6 lg:space-y-0 lg:items-start">
        {/* Main column */}
        <div className="space-y-4 sm:space-y-6 lg:col-span-2">

      {/* WhatsApp group invite — shows once daily until joined */}
      <WhatsAppBanner />

      {/* Stats — compact strip (hidden for brand-new users) */}
      {!isNewUser && (
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <div className="card p-2.5 sm:p-4">
            <div className="flex items-center gap-1.5 mb-0.5">
              <TrendingUp className="w-3.5 h-3.5 text-ccb-primary" />
              <span className="text-xs text-ccb-muted">Rating</span>
            </div>
            <div className="text-lg sm:text-2xl font-bold text-ccb-primary">{profile?.rating ?? "—"}</div>
          </div>
          <div className="card p-2.5 sm:p-4">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Swords className="w-3.5 h-3.5 text-ccb-text" />
              <span className="text-xs text-ccb-muted">Games</span>
            </div>
            <div className="text-lg sm:text-2xl font-bold">{profile?.games_played ?? 0}</div>
          </div>
          <div className="card p-2.5 sm:p-4">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Zap className="w-3.5 h-3.5 text-ccb-success" />
              <span className="text-xs text-ccb-muted">Win %</span>
            </div>
            <div className="text-lg sm:text-2xl font-bold text-ccb-success">{winRate}%</div>
          </div>
        </div>
      )}

      {/* Getting Started card — only for brand-new users */}
      {isNewUser && (
        <div className="rounded-2xl border border-ccb-border bg-ccb-card p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-ccb-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wide text-ccb-text">Getting Started</h3>
          </div>
          <div className="space-y-2">
            {/* Step 1: Play */}
            <Link href="/play" className="flex items-center gap-3 rounded-xl bg-ccb-surface border border-ccb-border p-3 hover:border-ccb-primary/30 transition-colors group">
              <div className="w-9 h-9 rounded-xl bg-ccb-primary/15 flex items-center justify-center shrink-0">
                <Gamepad2 className="w-4.5 h-4.5 text-ccb-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ccb-text">Play your first game</p>
                <p className="text-xs text-ccb-muted">Quick match vs a human, or practice vs the computer</p>
              </div>
              <ChevronRight className="w-4 h-4 text-ccb-muted group-hover:translate-x-1 transition-transform shrink-0" />
            </Link>
            {/* Step 2: Join a league */}
            <Link href="/league" className="flex items-center gap-3 rounded-xl bg-ccb-surface border border-ccb-border p-3 hover:border-ccb-primary/30 transition-colors group">
              <div className="w-9 h-9 rounded-xl bg-ccb-accent/15 flex items-center justify-center shrink-0">
                <Crown className="w-4.5 h-4.5 text-ccb-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ccb-text">Join a league</p>
                <p className="text-xs text-ccb-muted">Compete in seasonal leagues with players at your level</p>
              </div>
              <ChevronRight className="w-4 h-4 text-ccb-muted group-hover:translate-x-1 transition-transform shrink-0" />
            </Link>
            {/* Step 3: Wallet */}
            <Link href="/wallet" className="flex items-center gap-3 rounded-xl bg-ccb-surface border border-ccb-border p-3 hover:border-ccb-primary/30 transition-colors group">
              <div className="w-9 h-9 rounded-xl bg-ccb-success/15 flex items-center justify-center shrink-0">
                <Wallet className="w-4.5 h-4.5 text-ccb-success" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-ccb-text">Set up your wallet</p>
                <p className="text-xs text-ccb-muted">Deposit to play staked battles and win real money</p>
              </div>
              <ChevronRight className="w-4 h-4 text-ccb-muted group-hover:translate-x-1 transition-transform shrink-0" />
            </Link>
          </div>
          {/* Rating badge */}
          <div className="mt-3 flex items-center justify-between rounded-xl bg-ccb-primary/10 border border-ccb-primary/20 px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-ccb-primary" />
              <span className="text-xs text-ccb-muted">Your starting rating</span>
            </div>
            <span className="text-lg font-black text-ccb-primary">{profile?.rating ?? "—"}</span>
          </div>
        </div>
      )}

      {/* Quick Match — big primary CTA */}
      <Link href="/play" className="block relative overflow-hidden rounded-xl bg-gradient-to-r from-ccb-primary to-purple-600 p-4 sm:p-6 group active:scale-[0.98] transition-transform">
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Swords className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-lg sm:text-xl text-white">Quick Match</h3>
              <p className="text-sm text-white/80">Find an opponent and start playing</p>
            </div>
          </div>
          <ChevronRight className="w-6 h-6 text-white/70 group-hover:translate-x-1 transition-transform shrink-0" />
        </div>
      </Link>


      {/* Live now — broadcast games anyone can watch */}
      <LiveGamesCard />

      {/* Tournaments + Recent Games */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        {/* Upcoming tournaments */}
        <div className="card p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-base sm:text-lg">Competitions</h3>
            <Link href="/tournaments" className="text-xs text-ccb-primary hover:underline">View all</Link>
          </div>
          {activeTournaments && activeTournaments.length > 0 ? (
            <div className="space-y-2">
              {activeTournaments.map((t) => (
                <Link
                  key={t.id}
                  href={`/tournament/${t.id}`}
                  className="flex items-center justify-between rounded-lg bg-ccb-surface px-3 py-2.5 sm:px-4 sm:py-3 hover:bg-ccb-card transition-colors"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-ccb-accent shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{t.name}</div>
                      <div className="text-xs text-ccb-muted">
                        {new Date(t.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, {new Date(t.starts_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        {t.entry_fee ? ` · ${feeLabelById.get(t.id) ?? ""}` : " · Free"}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-ccb-muted shrink-0 ml-2" />
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ccb-muted">No upcoming competitions. Check back soon!</p>
          )}
        </div>

        {/* Recent games — enriched with opponent info */}
        <div className="card p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-base sm:text-lg">Recent Games</h3>
            <Link href="/history" className="text-xs text-ccb-primary hover:underline">View all</Link>
          </div>
          {recentGames && recentGames.length > 0 ? (
            <div className="space-y-2">
              {recentGames.map((game) => {
                const isWhite = game.white_player_id === user!.id;
                const oppId = isWhite ? game.black_player_id : game.white_player_id;
                const opp = recentOpponentMap.get(oppId);
                const won = game.winner === (isWhite ? "white" : "black");
                const drew = game.status === "draw";
                const aborted = game.status === "abort";
                const result = won ? "W" : drew ? "D" : aborted ? "—" : "L";
                const resultColor = won ? "text-ccb-success" : drew ? "text-ccb-silver" : aborted ? "text-ccb-muted" : "text-ccb-danger";
                const resultBg = won ? "bg-ccb-success/10" : drew ? "bg-ccb-silver/10" : aborted ? "bg-ccb-muted/10" : "bg-ccb-danger/10";
                const oppName = opp?.display_name || opp?.username || "Unknown";

                return (
                  <Link
                    key={game.id}
                    href={`/game/${game.id}`}
                    className="flex items-center gap-2.5 rounded-lg bg-ccb-surface px-3 py-2.5 hover:bg-ccb-card transition-colors"
                  >
                    {/* Result badge */}
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${resultBg} ${resultColor} shrink-0`}>
                      {result}
                    </span>
                    {/* Opponent avatar */}
                    <div className="shrink-0">
                      {opp?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={opp.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-ccb-primary/20 flex items-center justify-center">
                          <span className="text-[10px] font-bold text-ccb-primary">{oppName.charAt(0).toUpperCase()}</span>
                        </div>
                      )}
                    </div>
                    {/* Name + meta */}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{oppName}</div>
                      <div className="text-[11px] text-ccb-muted capitalize">{game.time_control} · {isWhite ? "White" : "Black"}</div>
                    </div>
                    {/* Date */}
                    <span className="text-xs text-ccb-muted shrink-0">
                      {new Date(game.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-ccb-muted mb-3">No games yet — your stats will appear here after your first match.</p>
              <Link href="/play" className="inline-flex items-center gap-2 text-xs font-bold text-ccb-primary hover:text-ccb-primary/80 transition-colors">
                <Swords className="w-3.5 h-3.5" />
                Play your first game
                <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          )}
        </div>
      </div>

        </div>

        {/* Right rail */}
        <div className="space-y-4 sm:space-y-6">
          {/* Community Room — the WhatsApp group, now native */}
          <Link href="/chats" className="block rounded-xl border border-ccb-border bg-ccb-card p-4 group active:scale-[0.98] transition-transform">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-ccb-primary/15 flex items-center justify-center shrink-0">
                  <MessageCircle className="w-5.5 h-5.5 text-ccb-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-ccb-text">Chats</h3>
                  <p className="text-xs text-ccb-muted">Group chats & direct messages with fellow players</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-ccb-muted group-hover:translate-x-1 transition-transform shrink-0" />
            </div>
          </Link>
          {/* Wallet quick link */}
          <Link href="/wallet" className="flex items-center justify-between rounded-xl bg-ccb-surface border border-ccb-border px-4 py-3 group">
            <div className="flex items-center gap-2.5">
              <Wallet className="w-4 h-4 text-ccb-accent" />
              <div>
                <span className="text-xs text-ccb-muted block">Wallet</span>
                <span className="text-sm font-bold">{walletBalance}</span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-ccb-muted group-hover:translate-x-1 transition-transform" />
          </Link>

          {/* Lobby ad — admin-managed (Ads > Lobby). Renders nothing when off. */}
          <AdSlot placement="lobby" className="pt-2" />
        </div>
      </div>
    </div>
  );
}
