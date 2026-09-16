import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateDraft, type CampaignDraft } from "@/lib/ads/direct-pricing";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { user: null, admin: null, status: 401 };
  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) return { user: null, admin: null, status: 403 };
  return { user, admin, status: 200 };
}

/**
 * GET /api/admin/ads — all direct-ad campaigns, newest first, with
 * advertiser identity for moderation.
 */
export async function GET() {
  const { admin, status } = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status });
  const { data, error } = await admin
    .from("ad_campaigns")
    .select(`*, advertiser:profiles!ad_campaigns_advertiser_id_fkey(username,email)`)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaigns: data || [] });
}

/**
 * POST /api/admin/ads — create a FREE (house/comped) ad campaign straight
 * from the admin panel. No wallet debit, no ledger row, no affiliate
 * commission (nothing was paid, so there is nothing to share or refund).
 * Activates immediately by default; set activate_now=false to file it as
 * pending_review like a player purchase.
 */
export async function POST(req: NextRequest) {
  const { user, admin, status } = await requireAdmin();
  if (!admin || !user) return NextResponse.json({ error: "Forbidden" }, { status });

  let body: Partial<CampaignDraft> & { activate_now?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const invalid = validateDraft(body);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  const activateNow = body.activate_now !== false;
  const now = new Date();
  const end = new Date(now.getTime() + body.weeks! * 7 * 24 * 60 * 60 * 1000);

  const { data: campaign, error } = await admin
    .from("ad_campaigns")
    .insert({
      advertiser_id: user.id, // admin's own account owns house ads
      business_name: body.business_name!.trim(),
      headline: body.headline!.trim(),
      body: body.body?.trim() || null,
      image_url: body.image_url?.trim() || null,
      target_url: body.target_url!.trim(),
      weeks: body.weeks!,
      price_mwk: 0, // free — house/comped placement
      target_country: body.target_country || null,
      target_gender: body.target_gender || null,
      status: activateNow ? "active" : "pending_review",
      starts_at: activateNow ? now.toISOString() : null,
      ends_at: activateNow ? end.toISOString() : null,
    })
    .select("id,status,ends_at")
    .single();

  if (error || !campaign) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ campaign }, { status: 201 });
}

/**
 * PATCH /api/admin/ads — moderate a campaign.
 *  approve → active now, ends_at = now + weeks
 *  reject  → rejected (stays paid; no refund — ad space was held. Admin
 *            may refund manually with the refund action.)
 *  pause | resume | refund (full wallet refund, status → refunded)
 */
export async function PATCH(req: NextRequest) {
  const { admin, status } = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status });

  const { id, action, reject_reason } = await req.json();
  if (!id || typeof id !== "string") return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: campaign } = await admin.from("ad_campaigns").select("id,status,weeks,price_mwk,advertiser_id,starts_at,ends_at").eq("id", id).single();
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const now = new Date();

  if (action === "approve") {
    const end = new Date(now.getTime() + campaign.weeks * 7 * 24 * 60 * 60 * 1000);
    const { error } = await admin.from("ad_campaigns")
      .update({ status: "active", starts_at: now.toISOString(), ends_at: end.toISOString(), reject_reason: null })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "reject") {
    const { error } = await admin.from("ad_campaigns")
      .update({ status: "rejected", reject_reason: String(reject_reason || "Not approved").slice(0, 200) })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "pause") {
    const { error } = await admin.from("ad_campaigns").update({ status: "paused" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "resume") {
    const { error } = await admin.from("ad_campaigns").update({ status: "active" }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "refund") {
    const { error: creditErr } = await admin.rpc("credit_wallet", { p_user_id: campaign.advertiser_id, p_amount: campaign.price_mwk });
    if (creditErr) return NextResponse.json({ error: "Refund failed" }, { status: 500 });
    await admin.from("ad_campaigns").update({ status: "refunded", ends_at: now.toISOString() }).eq("id", id);
    await admin.from("deposits").insert({
      user_id: campaign.advertiser_id,
      method: "ad_refund",
      amount: campaign.price_mwk,
      reference: `ad_campaign_refund:${id}`,
      admin_notes: `Direct ad campaign refunded (MK${campaign.price_mwk})`,
    });

    // Reverse the referrer's ad commission for this campaign (if any was
    // paid) so the program never pays on money returned to the advertiser.
    const { error: clawErr } = await admin.rpc("clawback_affiliate_ad_commission", { p_campaign_id: id });
    if (clawErr) console.error(`MANUAL INTERVENTION: affiliate ad clawback failed for campaign ${id}:`, clawErr.message);

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
