import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
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
  // PHASE 1 SAFETY: gate the page itself, not just the API routes.
  // Logged-out users go to login; non-admins are bounced to the home page
  // instead of seeing an empty admin shell (which leaked the console
  // structure to any authenticated player).
  if (!user) redirect("/login?redirect=/admin");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, display_name, is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) redirect("/");

  return <AdminDashboard adminName={profile?.display_name || profile?.username || "Admin"} />;
}
