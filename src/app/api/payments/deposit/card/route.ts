import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { amountCents, email } = await req.json();

    // ─── Load platform config ──────────────────────────────────────────
    const admin = createAdminClient();
    const dConfig = await getPlatformConfig(admin, "deposits");

    if (!dConfig.enabled) {
      return NextResponse.json({ error: "Deposits are currently disabled" }, { status: 403 });
    }

    const minAmount = dConfig.min_amount_cents || 1000;
    if (!amountCents || amountCents < minAmount) {
      const minDisplay = Math.floor(minAmount / 100).toLocaleString();
      return NextResponse.json({ error: `Minimum deposit is MWK ${minDisplay}` }, { status: 400 });
    }

    const maxAmount = dConfig.max_amount_cents || 10_000_000;
    if (amountCents > maxAmount) {
      const maxDisplay = Math.floor(maxAmount / 100).toLocaleString();
      return NextResponse.json({ error: `Maximum deposit is MWK ${maxDisplay}` }, { status: 400 });
    }

    const txRef = `ccb_${Date.now()}_${user.id.slice(0, 8)}`;
    const amount = Math.floor(amountCents / 100).toString();

    const { data: deposit } = await admin
      .from("deposits")
      .insert({
        user_id: user.id,
        amount_cents: amountCents,
        method: "card",
        status: "pending",
        tx_ref: txRef,
      })
      .select("id")
      .single();

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://crazychessbattles.live";
    const res = await fetch("https://api.paychangu.com/payment", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency: "MWK",
        tx_ref: txRef,
        email: email || undefined,
        callback_url: `${siteUrl}/api/payments/webhook`,
        return_url: `${siteUrl}/wallet?tx_ref=${txRef}`,
        customization: {
          title: "Crazy Chess Battles",
          description: "Wallet Deposit",
        },
      }),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      return NextResponse.json({ error: "Unable to initiate card payment. Please try again." }, { status: 400 });
    }

    return NextResponse.json({
      depositId: deposit?.id,
      txRef,
      checkoutUrl: data.data?.checkout_url || data.checkout_url,
    });
  } catch {
    return NextResponse.json({ error: "Server error. Please try again." }, { status: 500 });
  }
}
