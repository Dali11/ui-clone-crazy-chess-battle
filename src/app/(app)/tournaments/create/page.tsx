import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CreateTournamentClient from "./create-client";

export const metadata = { robots: { index: false, follow: false } };

export default async function CreateTournamentPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("wallet_balance, identity_verified, is_admin, country")
    .eq("id", user.id)
    .single();

  return (
    <CreateTournamentClient
      walletBalance={profile?.wallet_balance ?? 0}
      identityVerified={!!profile?.identity_verified}
      isAdmin={!!profile?.is_admin}
      countryCode={profile?.country ?? null}
    />
  );
}
