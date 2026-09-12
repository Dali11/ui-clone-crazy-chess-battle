export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import MembershipClient from "./membership-client";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Membership — Crazy Chess Battles Club",
  description: "Join the Crazy Chess Battles Club. One flat monthly price, zero ads, and you keep the rewards flowing.",
  path: "/membership",
  noIndex: true
});

export default async function MembershipPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/membership");
  }

  return <MembershipClient />;
}
