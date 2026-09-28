import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  normalizeRefCode,
  validateTrackRequest,
  attributeReferral,
} from "@/lib/affiliate/track";

/**
 * POST /api/affiliate/track  { referrerCode, referredId }
 *
 * Called right after signup (and as a login-time retry — see login-client):
 * records ONE referral row linking the new player to the person whose link
 * they used. Never credits anything — commissions only fire later, when the
 * referred player buys membership (and only while the affiliate switch is ON).
 *
 * Attribution logic lives in the shared attributeReferral() helper, which the
 * signup-completion route (/api/auth/set-rating) also calls server-side, so
 * tracking survives client-side blockers and network hiccups.
 *
 * Response contract (relied on by signup/login clients):
 *   200 {tracked: true}                      — referral recorded
 *   200 {tracked: false, reason: already_referred} — nothing to do, settled
 *   400 {error}                              — definitive rejection (unknown
 *                                             code / self-referral): caller
 *                                             should stop retrying
 *   500 {error}                              — transient: caller may retry
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { referrerCode, referredId } = await req.json();
    const check = validateTrackRequest(referrerCode, referredId, user.id);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    // Keep the code as typed by the referrer (exact case stored in the row),
    // while lookup stays case-insensitive inside attributeReferral.
    const rawCode = (referrerCode || "").trim();
    void normalizeRefCode(rawCode);

    const admin = createAdminClient();
    const result = await attributeReferral(admin, rawCode, user.id);

    if (!result.settled) {
      return NextResponse.json({ error: "Tracking failed" }, { status: 500 });
    }
    if (result.status === "unknown") {
      return NextResponse.json({ error: "Unknown referral code" }, { status: 400 });
    }
    if (result.status === "self") {
      return NextResponse.json({ error: "Self-referral" }, { status: 400 });
    }
    if (result.status === "already") {
      return NextResponse.json({ tracked: false, reason: "already_referred" });
    }
    return NextResponse.json({ tracked: true });
  } catch (e) {
    console.error("affiliate track error", e);
    return NextResponse.json({ error: "Tracking failed" }, { status: 500 });
  }
}
