export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import WalletClient from "./wallet-client";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Wallet — Manage Your Balance",
  description: "Manage your wallet balance on Crazy Chess Battles. Deposit, withdraw, and track transactions.",
  path: "/wallet",
  noIndex: true
});


export default async function WalletPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/wallet");
  }

  // Parallelize profile + deposits queries
  let deposits: any[] = [];
  const profilePromise = supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const depositsPromise = supabase
    .from("deposits")
    .select("id, amount, method, status, created_at, charge_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Deposits query might fail if table doesn't exist — wrap in try/catch
  let profileRes: any, depositsRes: any = null;
  try {
    [profileRes, depositsRes] = await Promise.all([
      profilePromise,
      depositsPromise,
    ]);
  } catch {
    profileRes = await profilePromise;
  }

  const profile = profileRes?.data;
  if (depositsRes && !depositsRes.error && depositsRes.data) {
    deposits = depositsRes.data;
  }

  return (
    <WalletClient
      balance={profile?.wallet_balance || 0}
      email={user.email || ""}
      deposits={deposits}
      phone={profile?.phone || null}
      depositPhones={Array.isArray(profile?.deposit_phone_numbers) ? profile.deposit_phone_numbers : []}
      country={profile?.country || null}
    />
  );
}
