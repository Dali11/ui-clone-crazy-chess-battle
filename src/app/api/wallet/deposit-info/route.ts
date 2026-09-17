import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/wallet/deposit-info
 *
 * Lightweight, client-fetchable version of what the (server-rendered)
 * wallet page already has in scope — used by <DepositModal/> so any page
 * (e.g. a "join tournament failed — insufficient balance" prompt) can pop
 * a fully localised deposit flow without redirecting to /wallet first.
 * Read-only; never touches the wallet itself.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("wallet_balance, country, deposit_phone_numbers")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    balance: profile?.wallet_balance || 0,
    country: profile?.country || null,
    email: user.email || "",
    depositPhones: Array.isArray(profile?.deposit_phone_numbers) ? profile.deposit_phone_numbers : [],
  });
}
