import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRefCode, validateTrackRequest } from "@/lib/affiliate/track";

/**
 * POST /api/affiliate/track  { referrerCode, referredId }
 *
 * Called right after signup: records ONE referral row linking the new
 * player to the person whose link they used. Never credits anything —
 * commissions only fire later, when the referred player buys membership
 * (and only while the affiliate switch is ON).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { referrerCode, referredId } = await req.json();
    const check = validateTrackRequest(referrerCode, referredId, user.id);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const code = normalizeRefCode(referrerCode);
    const admin = createAdminClient();

    // Resolve referrer by referral code, falling back to username (links may
    // be built from either — profiles.referral_code falls back to username).
    // Usernames/codes can contain uppercase letters, so match case-
    // insensitively (same convention as /api/auth/login and
    // /api/auth/forgot-password), preferring an exact-case hit if two rows
    // differ only by case.
    let ref: { id: string } | null = null;

    const { data: byCode } = await admin
      .from("profiles")
      .select("id, referral_code, username")
      .ilike("referral_code", code)
      .limit(5);
    ref = (byCode?.find((c: any) => c.referral_code === code) ?? byCode?.[0]) || null;

    if (!ref) {
      const { data: byUsername } = await admin
        .from("profiles")
        .select("id, referral_code, username")
        .ilike("username", code)
        .limit(5);
      ref = (byUsername?.find((c: any) => c.username === code) ?? byUsername?.[0]) || null;
    }

    if (!ref) return NextResponse.json({ error: "Unknown referral code" }, { status: 400 });
    if (ref.id === user.id) return NextResponse.json({ error: "Self-referral" }, { status: 400 });

    // One referral per referred player — a second signup link changes nothing.
    // (Also enforced at the DB level by a unique index on referred_id.)
    const { data: existing } = await admin
      .from("referrals")
      .select("id")
      .eq("referred_id", user.id)
      .limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json({ tracked: false, reason: "already_referred" });
    }

    const { error: insertError } = await admin.from("referrals").insert({
      referrer_id: ref.id,
      referred_id: user.id,
      referral_code: code,
      status: "pending",
      berries_awarded: 0,
    });
    if (insertError) {
      // Race: another request for the same referred_id won by a hair.
      if (insertError.code === "23505") {
        return NextResponse.json({ tracked: false, reason: "already_referred" });
      }
      console.error("affiliate track insert error", insertError);
      return NextResponse.json({ error: "Tracking failed" }, { status: 500 });
    }

    return NextResponse.json({ tracked: true });
  } catch (e) {
    console.error("affiliate track error", e);
    return NextResponse.json({ error: "Tracking failed" }, { status: 500 });
  }
}
