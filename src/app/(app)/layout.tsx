import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AppNav from "@/components/layout/app-nav";
import ActiveBattleWatcher from "@/components/battles/active-battle-watcher";
import ActiveTournamentWatcher from "@/components/layout/active-tournament-watcher";
import TournamentPopup from "@/components/layout/tournament-popup";
import OpenMatchBanner from "@/components/layout/open-match-banner";
import LeagueRegistrationPopup from "@/components/layout/league-registration-popup";
import ActiveGameRedirect from "@/components/layout/active-game-redirect";


export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, rating, avatar_url, is_admin, wallet_balance")
    .eq("id", user.id)
    .single();

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav profile={profile} />
      <ActiveBattleWatcher />
      <ActiveTournamentWatcher />
      <TournamentPopup />
      <OpenMatchBanner />
      <LeagueRegistrationPopup />
      <ActiveGameRedirect />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {children}
      </main>
    </div>
  );
}
