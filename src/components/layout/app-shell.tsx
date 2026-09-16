"use client";

import { usePathname } from "next/navigation";
import AppNav from "./app-nav";
import ActiveBattleWatcher from "@/components/battles/active-battle-watcher";
import ActiveTournamentWatcher from "@/components/layout/active-tournament-watcher";
import TournamentPopup from "@/components/layout/tournament-popup";
import ClubJoinPopup from "@/components/layout/club-join-popup";
import OpenMatchBanner from "@/components/layout/open-match-banner";
import ActiveGameRedirect from "@/components/layout/active-game-redirect";
import { isGameRoute } from "@/lib/is-game-route";

/**
 * The authenticated app chrome: top nav, bottom nav, watchers/popups and
 * the content container. Extracted from (app)/layout so pages outside
 * the (app) group (e.g. /advertise, which also renders a public landing
 * for logged-out visitors) can reuse the exact same shell.
 *
 * On game routes, AppNav hides its desktop sidebar (see is-game-route.ts)
 * to give the board more room — this component drops the matching
 * lg:pl-60 left padding so content doesn't leave a blank 240px gap where
 * the sidebar used to be, and lets `main` go full width instead of being
 * capped at max-w-6xl, chess.com-style two-column layout (board + panel).
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
  const pathname = usePathname();
  const inGame = isGameRoute(pathname);

  return (
    // lg:pl-60 clears the fixed desktop sidebar rendered by AppNav — dropped
    // on game routes since AppNav doesn't render that sidebar there.
    <div className={`min-h-screen flex flex-col ${inGame ? "" : "lg:pl-60"}`}>
      <AppNav profile={profile} />
      <ActiveBattleWatcher />
      <ActiveTournamentWatcher />
      <TournamentPopup />
      <ClubJoinPopup />
      <OpenMatchBanner />
      <ActiveGameRedirect />
      <main
        className={
          inGame
            ? "flex-1 w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6"
            : "flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6"
        }
      >
        {children}
      </main>
    </div>
  );
}
