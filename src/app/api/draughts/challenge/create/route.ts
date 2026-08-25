import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { timeControl, rated, expiryMinutes, variant } = await req.json();
    const admin = createAdminClient();

    const expiryMins = Math.min(Math.max(expiryMinutes || 10, 10), 1440);

    const { data: profile } = await admin
      .from("profiles")
      .select("referral_code, username")
      .eq("id", user.id)
      .single();

    const referralCode = profile?.referral_code || profile?.username || null;

    const tcMap: Record<string, { minutes: number; increment: number }> = {
      bullet: { minutes: 1, increment: 0 },
      blitz: { minutes: 5, increment: 0 },
      rapid: { minutes: 10, increment: 0 },
    };

    const tc = tcMap[timeControl] || tcMap.rapid;

    const { data: challenge, error } = await admin
      .from("draughts_challenges")
      .insert({
        challenger_id: user.id,
        time_control: timeControl || "rapid",
        initial_minutes: tc.minutes,
        increment_seconds: tc.increment,
        rated: rated ?? true,
        variant: variant || "international",
        color: "random",
        status: "pending",
        expires_at: new Date(Date.now() + expiryMins * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (error || !challenge) {
      return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://crazychessbattles.live";
    const url = referralCode
      ? `${baseUrl}/draughts/challenge/${challenge.id}?ref=${referralCode}`
      : `${baseUrl}/draughts/challenge/${challenge.id}`;

    return NextResponse.json({ challengeId: challenge.id, url, referralCode });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
