import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { stakeCents, timeControl } = await req.json();
    if (!stakeCents || stakeCents <= 0) {
      return NextResponse.json({ error: "Invalid stake amount" }, { status: 400 });
    }

    const admin = createAdminClient();

    // ─── Load platform config ──────────────────────────────────────────
    const bConfig = await getPlatformConfig(admin, "battles");

    // Check if battles are enabled
    if (!bConfig.enabled) {
      return NextResponse.json({ error: "Chess Battles are currently disabled" }, { status: 403 });
    }

    // Enforce min/max stake from platform settings
    const minStake = bConfig.min_stake_cents || 50_000;
    const maxStake = bConfig.max_stake_cents || 1_000_000;
    if (stakeCents < minStake) {
      const minDisplay = Math.floor(minStake / 100).toLocaleString();
      return NextResponse.json({ error: `Minimum stake is MWK ${minDisplay}` }, { status: 400 });
    }
    if (stakeCents > maxStake) {
      const maxDisplay = Math.floor(maxStake / 100).toLocaleString();
      return NextResponse.json({ error: `Maximum stake is MWK ${maxDisplay}` }, { status: 400 });
    }

    // Check active battle
    const { data: activeBattle } = await admin
      .from("battles")
      .select("id")
      .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
      .in("status", ["pending", "playing", "draw_armageddon"])
      .limit(1);

    if (activeBattle && activeBattle.length > 0) {
      return NextResponse.json({ error: "You have an active battle. Finish it first." }, { status: 400 });
    }

    // Check wallet balance
    const { data: profile } = await admin
      .from("profiles")
      .select("wallet_balance_cents, games_played, referral_code, username")
      .eq("id", user.id)
      .single();

    if ((profile?.wallet_balance_cents || 0) < stakeCents) {
      return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 400 });
    }

    // Create battle with platform fee from settings
    const platformFeePct = bConfig.platform_fee_pct ?? 10;
    const referralCode = profile?.referral_code || profile?.username || null;

    const { data: battle, error } = await admin
      .from("battles")
      .insert({
        white_player_id: user.id,
        stake_cents: stakeCents,
        time_control: timeControl || "blitz",
        platform_fee_pct: platformFeePct,
        status: "pending",
        referral_code: referralCode,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ battleId: battle.id });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to create battle" }, { status: 500 });
  }
}
