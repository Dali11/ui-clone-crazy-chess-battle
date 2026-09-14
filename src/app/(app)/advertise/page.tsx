export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdvertiseClient from "./advertise-client";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Advertise — Crazy Chess Battles",
  description: "Put your business in front of thousands of chess players. Flat weekly rates, no bidding, live stats.",
  path: "/advertise",
  noIndex: true
});

export default async function AdvertisePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/advertise");
  }

  return <AdvertiseClient />;
}
