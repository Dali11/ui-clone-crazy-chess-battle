import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { timeControl, rated, expiryMinutes } = await req.json();
    const admin = createAdminClient();

    // Clamp expiry to allowed range (5 min – 24 hours)
    const expiryMins = Math.min(Math.max(expiryMinutes || 60, 5), 1440);

    // Get the user's referral code to append to the challenge link
    const { data: profile } = await admin
      .from("profiles")
      .select("referral_code, username")
      .eq("id", user.id)
      .single();

    const referralCode = profile?.referral_code || profile?.username || null;

    // Map time control IDs to minutes/increment
    const tcMap: Record<string, { minutes: number; increment: number; base: string }> = {
      bullet: { minutes: 1, increment: 0, base: "bullet" },
      blitz: { minutes: 3, increment: 2, base: "blitz" },
      blitz3: { minutes: 3, increment: 2, base: "blitz" },
      rapid: { minutes: 10, increment: 0, base: "rapid" },
      rapid15: { minutes: 15, increment: 10, base: "rapid" },
      classical: { minutes: 30, increment: 0, base: "classical" },
    };

    const tc = tcMap[timeControl] || tcMap.blitz;

    // Create challenge record
    const { data: challenge, error } = await admin
      .from("challenges")
      .insert({
        challenger_id: user.id,
        time_control: timeControl || "blitz",
        initial_minutes: tc.minutes,
        increment_seconds: tc.increment,
        rated: rated ?? true,
        color: "random",
        status: "pending",
        expires_at: new Date(Date.now() + expiryMins * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (error || !challenge) {
      return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
    }

    // Build URL with referral code
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://crazychessbattles.live";
    const url = referralCode
      ? `${baseUrl}/challenge/${challenge.id}?ref=${referralCode}`
      : `${baseUrl}/challenge/${challenge.id}`;

    return NextResponse.json({ challengeId: challenge.id, url, referralCode });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
