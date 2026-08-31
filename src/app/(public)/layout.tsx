import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import AppNav from "@/components/layout/app-nav";
import ActiveBattleWatcher from "@/components/battles/active-battle-watcher";
import OpenMatchBanner from "@/components/layout/open-match-banner";

export const metadata: Metadata = {
  robots: { index: true, follow: true },
};

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("username, display_name, rating, avatar_url, is_admin, wallet_balance, country")
      .eq("id", user.id)
      .single();
    profile = profileData;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav profile={profile} />
      <ActiveBattleWatcher />
      <OpenMatchBanner />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-4 sm:py-6">
        {children}
      </main>
    </div>
  );
}
