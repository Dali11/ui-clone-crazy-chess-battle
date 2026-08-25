import { createClient } from "@/lib/supabase/server";
import AdminDashboard from "./admin-client";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Admin Panel",
  description: "Crazy Chess Battles admin panel.",
  path: "/admin",
  noIndex: true
});


export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name")
    .eq("id", user.id)
    .single();

  return <AdminDashboard adminName={profile?.display_name || profile?.username || "Admin"} />;
}
