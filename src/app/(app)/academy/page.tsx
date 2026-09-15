import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMember } from "@/lib/membership/membership";
import AcademyClient from "@/components/academy/academy-client";

export const metadata: Metadata = {
  title: "Chess Academy — Crazy Chess Battles",
};

export default async function AcademyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let member = false;
  if (user) {
    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("membership_until")
      .eq("id", user.id)
      .single();
    member = isMember(profile?.membership_until, new Date().toISOString());
  }

  return <AcademyClient member={member} />;
}
