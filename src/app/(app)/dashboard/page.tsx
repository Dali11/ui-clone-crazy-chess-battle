import type { Metadata } from "next";

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { Swords, Trophy, TrendingUp, Wallet, Zap, ChevronRight, Cherry, Gift } from "lucide-react";
import WhatsAppBanner from "@/components/layout/whatsapp-banner";

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

  // Fetch profile first (needed for rating init logic)
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
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

  const winRate = profile?.games_played
    ? Math.round(((profile.wins ?? 0) / profile.games_played) * 100)
    : 0;

  const walletBalance = profile?.wallet_balance
    ? `MK ${profile.wallet_balance.toLocaleString("en-US")}`
    : "MK 0";
  const berryBalance = profile?.berry_balance ?? 0;

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 sm:pb-6">
      {/* Welcome */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">
          Welcome back, {profile?.display_name || profile?.username || "Player"}
        </h1>
        <p className="text-sm text-ccb-muted mt-1">Ready for a battle?</p>
      </div>

      {/* WhatsApp group invite — shows once daily until joined */}
      <WhatsAppBanner />

      {/* Stats — compact strip */}
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

      {/* Tournaments + Recent Games */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Upcoming tournaments */}
        <div className="card p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-base sm:text-lg">Competitions</h3>
            <Link href="/league" className="text-xs text-ccb-primary hover:underline">View all</Link>
          </div>
          {activeTournaments && activeTournaments.length > 0 ? (
            <div className="space-y-2">
              {activeTournaments.map((t) => (
                <Link
                  key={t.id}
                  href={`/league`}
                  className="flex items-center justify-between rounded-lg bg-ccb-surface px-3 py-2.5 sm:px-4 sm:py-3 hover:bg-ccb-card transition-colors"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-ccb-accent shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{t.name}</div>
                      <div className="text-xs text-ccb-muted">
                        {new Date(t.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        {t.entry_fee ? ` · MK ${t.entry_fee}` : " · Free"}
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

        {/* Recent games */}
        <div className="card p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-base sm:text-lg">Recent Games</h3>
            <Link href="/history" className="text-xs text-ccb-primary hover:underline">View all</Link>
          </div>
          {recentGames && recentGames.length > 0 ? (
            <div className="space-y-2">
              {recentGames.map((game) => {
                const isWhite = game.white_player_id === user!.id;
                const won = game.winner === (isWhite ? "white" : "black");
                const drew = game.status === "draw";
                const aborted = game.status === "abort";
                const result = won ? "W" : drew ? "D" : aborted ? "—" : "L";
                const resultColor = won ? "text-ccb-success" : drew ? "text-ccb-silver" : aborted ? "text-ccb-muted" : "text-ccb-danger";

                return (
                  <Link
                    key={game.id}
                    href={`/game/${game.id}`}
                    className="flex items-center justify-between rounded-lg bg-ccb-surface px-3 py-2.5 sm:px-4 sm:py-3 hover:bg-ccb-card transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`text-sm font-bold w-5 ${resultColor}`}>{result}</span>
                      <span className="text-sm capitalize">{game.time_control}</span>
                    </div>
                    <span className="text-xs text-ccb-muted">
                      {new Date(game.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-ccb-muted">No games yet. Start playing!</p>
          )}
        </div>
      </div>

      {/* Berry + Wallet row */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <Link href="/earn" className="flex items-center justify-between rounded-xl bg-gradient-to-br from-red-500/10 to-ccb-surface border border-red-500/20 px-4 py-3 group">
          <div className="flex items-center gap-2.5">
            <Cherry className="w-4 h-4 text-red-500" />
            <div>
              <span className="text-xs text-ccb-muted block">CCB Berries</span>
              <span className="text-sm font-bold">{berryBalance.toLocaleString()} 🍒</span>
            </div>
          </div>
          <Gift className="w-4 h-4 text-ccb-muted group-hover:translate-x-1 transition-transform" />
        </Link>
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
      </div>
    </div>
  );
}
