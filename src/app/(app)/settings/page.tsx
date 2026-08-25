import { createClient } from "@/lib/supabase/server";
import SettingsClient from "./settings-client";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Settings — Account Preferences",
  description: "Manage your Crazy Chess Battles account settings, profile, and preferences.",
  path: "/settings",
  noIndex: true
});


export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single();

  return <SettingsClient profile={profile} userId={user!.id} />;
}
