import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateDraft, isSafeTargetUrl } from "@/lib/ads/direct-pricing";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/ads/campaigns/[id] — the advertiser edits their own campaign,
 * including swapping the creative. Advertiser-owned; weeks/price are not
 * editable (buying more time = a new campaign).
 *
 * Status rules:
 *  - pending_review: stays pending_review (updated content goes through
 *    the original review).
 *  - rejected: flips back to pending_review, reject_reason cleared —
 *    the advertiser fixed what was wrong.
 *  - active / paused: edit allowed, but the campaign drops back to
 *    pending_review so a human re-checks the new creative before it
 *    serves again (same-day re-review; run dates are preserved).
 *  - ended / refunded: not editable.
 */

const EDITABLE_STATUSES = ["pending_review", "rejected", "active", "paused"];

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let patch: Record<string, unknown>;
  try { patch = await req.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const { id } = await ctx.params;
  const admin = createAdminClient();
  const { data: campaign, error: loadErr } = await admin
    .from("ad_campaigns")
    .select("id,advertiser_id,business_name,headline,body,image_url,target_url,weeks,target_country,target_gender,status")
    .eq("id", id)
    .single();
  if (loadErr || !campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  if (campaign.advertiser_id !== user.id) return NextResponse.json({ error: "Not your campaign" }, { status: 403 });
  if (!EDITABLE_STATUSES.includes(campaign.status))
    return NextResponse.json({ error: "This campaign can no longer be edited" }, { status: 400 });

  // Merge patch onto the existing values, then validate the whole draft.
  // Explicit nulls clear image/body; undefined = untouched.
  const next = {
    business_name: patch.business_name as string | undefined,
    headline: patch.headline as string | undefined,
    body: (patch.body === undefined ? undefined : (patch.body as string | null)),
    image_url: (patch.image_url === undefined ? undefined : (patch.image_url as string | null)),
    target_url: patch.target_url as string | undefined,
    weeks: campaign.weeks,
    target_country: (patch.target_country === undefined ? undefined : (patch.target_country as string | null)),
    target_gender: (patch.target_gender === undefined ? undefined : (patch.target_gender as string | null)),
  };

  const merged = {
    business_name: next.business_name ?? campaign.business_name,
    headline: next.headline ?? campaign.headline,
    body: next.body === undefined ? campaign.body : next.body,
    image_url: next.image_url === undefined ? campaign.image_url : next.image_url,
    target_url: next.target_url ?? campaign.target_url,
    weeks: campaign.weeks,
    target_country: next.target_country === undefined ? campaign.target_country : next.target_country,
    target_gender: next.target_gender === undefined ? campaign.target_gender : next.target_gender,
  };

  // validateDraft covers lengths + https URL rules; target_url must exist.
  const invalid = validateDraft(merged);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
  if (merged.image_url && !isSafeTargetUrl(merged.image_url))
    return NextResponse.json({ error: "Image URL must be https" }, { status: 400 });

  const resubmit = campaign.status === "rejected" || campaign.status === "active" || campaign.status === "paused";

  const { data: updated, error: updErr } = await admin
    .from("ad_campaigns")
    .update({
      business_name: merged.business_name!.trim(),
      headline: merged.headline!.trim(),
      body: merged.body?.trim() || null,
      image_url: merged.image_url?.trim() || null,
      target_url: merged.target_url!.trim(),
      target_country: merged.target_country || null,
      target_gender: merged.target_gender || null,
      ...(campaign.status === "rejected" || resubmit
        ? { status: "pending_review", reject_reason: null }
        : {}),
    })
    .eq("id", id)
    .select("id,status")
    .single();

  if (updErr || !updated) return NextResponse.json({ error: "Failed to save changes" }, { status: 500 });

  return NextResponse.json({
    campaign: updated,
    resubmitted: resubmit,
  });
}
