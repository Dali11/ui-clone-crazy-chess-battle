import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — fetch user's referral stats
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Get or generate referral code
    let { data: profile } = await admin
      .from("profiles")
      .select("referral_code, username")
      .eq("id", user.id)
      .single();

    let referralCode = profile?.referral_code;

    if (!referralCode) {
      referralCode = profile?.username || `player-${user.id.slice(0, 8)}`;
      if (profile?.username) {
        await admin.from("profiles").update({ referral_code: profile.username }).eq("id", user.id);
      }
    }

    // Get referral stats
    const { data: referrals } = await admin
      .from("referrals")
      .select("id, status, berries_awarded, created_at, completed_at, activation_condition, quick_matches_played")
      .eq("referrer_id", user.id)
      .order("created_at", { ascending: false });

    const totalReferrals = referrals?.length || 0;
    const completedReferrals = referrals?.filter(r => r.status === "rewarded").length || 0;
    const pendingReferrals = referrals?.filter(r => r.status === "pending" || r.status === "signed_up").length || 0;
    const totalBerriesEarned = referrals?.reduce((sum, r) => sum + (r.berries_awarded || 0), 0) || 0;

    return NextResponse.json({
      referralCode,
      shareUrl: `https://crazychessbattles.live/signup?ref=${encodeURIComponent(referralCode)}`,
      rewardAmount: 1000,
      rewardKwacha: 500,
      stats: {
        total: totalReferrals,
        completed: completedReferrals,
        pending: pendingReferrals,
        berriesEarned: totalBerriesEarned,
      },
      referrals: referrals || [],
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
