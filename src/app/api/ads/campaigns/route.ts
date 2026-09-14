import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";
import { validateDraft, adPriceForWeeks, type CampaignDraft } from "@/lib/ads/direct-pricing";
import { getServerCurrency } from "@/lib/geo/server-currency";

export const dynamic = "force-dynamic";

/**
 * GET /api/ads/campaigns — the signed-in player's own ad campaigns
 * (with live status + stats) for the /advertise page.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ad_campaigns")
    .select("id,business_name,headline,body,image_url,target_url,weeks,price_mwk,status,starts_at,ends_at,impressions,clicks,reject_reason,created_at")
    .eq("advertiser_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Failed to load campaigns" }, { status: 500 });
  return NextResponse.json({ campaigns: data || [] });
}

/**
 * POST /api/ads/campaigns — buy a flat weekly campaign from wallet balance.
 * Debit first (atomic RPC), insert campaign; refund the debit if the
 * insert fails. Campaign starts pending_review; admin activates it.
 */
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Partial<CampaignDraft>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const invalid = validateDraft(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const admin = createAdminClient();
  const cfg = await getPlatformConfig(admin, "direct_ads");
  if (!cfg?.enabled) return NextResponse.json({ error: "Direct ads are not available right now" }, { status: 403 });

  const base = Number(cfg.price_per_week_mwk || 5000);
  const price = adPriceForWeeks(body.weeks!, base);
  if (!price) return NextResponse.json({ error: "Invalid duration" }, { status: 400 });

  // Wallet balance check (debit_wallet also enforces it, but a clean
  // pre-check gives a friendlier error than a raw RPC failure).
  const { data: profile } = await admin.from("profiles").select("wallet_balance,country").eq("id", user.id).single();
  if ((profile?.wallet_balance || 0) < price) {
    return NextResponse.json({ error: `Insufficient wallet balance — need MK${price.toLocaleString()}. Top up your wallet first.` }, { status: 400 });
  }

  // Every advertiser is quoted and charged in their own currency — the
  // wallet ledger stays MWK internally (platform's base unit, same as
  // league payouts), but we record the prevailing forex-converted amount
  // for the audit trail, same pattern as league payout FX snapshots.
  const buyerCurrency = await getServerCurrency(profile?.country);
  const localAmount = Math.round(price * buyerCurrency.rate);

  const { error: debitErr } = await admin.rpc("debit_wallet", { p_user_id: user.id, p_amount: price });
  if (debitErr) return NextResponse.json({ error: "Failed to debit wallet. Try again." }, { status: 500 });

  const { data: campaign, error: insertErr } = await admin
    .from("ad_campaigns")
    .insert({
      advertiser_id: user.id,
      business_name: body.business_name!.trim(),
      headline: body.headline!.trim(),
      body: body.body?.trim() || null,
      image_url: body.image_url?.trim() || null,
      target_url: body.target_url!.trim(),
      weeks: body.weeks!,
      price_mwk: price,
      status: "pending_review",
    })
    .select("id")
    .single();

  if (insertErr || !campaign) {
    const { error: refundErr } = await admin.rpc("credit_wallet", { p_user_id: user.id, p_amount: price });
    if (refundErr) console.error(`MANUAL INTERVENTION: ad purchase refund failed for ${user.id} (MK${price})`);
    return NextResponse.json({ error: "Failed to create campaign — you have been refunded." }, { status: 500 });
  }

  // Ledger row (audit trail; wallet debit is the source of truth)
  await admin.from("deposits").insert({
    user_id: user.id,
    method: "ad_purchase",
    amount: -price,
    reference: `ad_campaign:${campaign.id}`,
    admin_notes: buyerCurrency.currencyCode === "MWK"
      ? `Direct ad campaign purchase (${body.weeks}w @ MK${price})`
      : `Direct ad campaign purchase (${body.weeks}w @ MK${price} = ${buyerCurrency.currencySymbol}${localAmount.toLocaleString()} at ${buyerCurrency.rate.toFixed(4)} fx)`,
  }).then((r) => { if (r.error) console.error("[ads/campaigns] ledger insert failed:", r.error.message); });

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      status: "pending_review",
      price_mwk: price,
      charged_local: localAmount,
      currency_code: buyerCurrency.currencyCode,
    },
  });
}
