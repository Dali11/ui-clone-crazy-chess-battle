import AppNav from "./app-nav";
import ActiveBattleWatcher from "@/components/battles/active-battle-watcher";
import ActiveTournamentWatcher from "@/components/layout/active-tournament-watcher";
import TournamentPopup from "@/components/layout/tournament-popup";
import ClubJoinPopup from "@/components/layout/club-join-popup";
import OpenMatchBanner from "@/components/layout/open-match-banner";
import ActiveGameRedirect from "@/components/layout/active-game-redirect";

/**
 * The authenticated app chrome: top nav, bottom nav, watchers/popups and
 * the content container. Extracted from (app)/layout so pages outside
 * the (app) group (e.g. /advertise, which also renders a public landing
 * for logged-out visitors) can reuse the exact same shell.
 */
export default function AppShell({
  profile,
  children,
}: {
  profile: {
    username: string | null;
    display_name: string | null;
    rating: number | null;
    avatar_url: string | null;
    is_admin: boolean;
    wallet_balance: number | null;
    country: string | null;
  } | null;
  children: React.ReactNode;
}) {
  return (
    // lg:pl-60 clears the fixed desktop sidebar rendered by AppNav
    <div className="min-h-screen flex flex-col lg:pl-60">
      <AppNav profile={profile} />
      <ActiveBattleWatcher />
      <ActiveTournamentWatcher />
      <TournamentPopup />
      <ClubJoinPopup />
      <OpenMatchBanner />
      <ActiveGameRedirect />
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
        {children}
      </main>
    </div>
  );
}
