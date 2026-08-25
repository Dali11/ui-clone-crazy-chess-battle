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

    // For challenges, allow any stake within min/max bounds
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
      .select("wallet_balance_cents")
      .eq("id", user.id)
      .single();

    if ((profile?.wallet_balance_cents || 0) < stakeCents) {
      return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 400 });
    }

    // Debit the challenger's stake into escrow
    const { error: debitErr } = await admin.rpc("debit_wallet", {
      p_user_id: user.id,
      p_amount_cents: stakeCents,
    });

    if (debitErr) {
      return NextResponse.json({ error: "Failed to lock stake. Try again." }, { status: 500 });
    }

    await admin.from("deposits").insert({
      user_id: user.id,
      amount_cents: stakeCents,
      status: "success",
      method: "battle_challenge_escrow",
      reference: `battle_challenge_create:${user.id}:${stakeCents}`,
    });

    // Create the challenge record (expires in 24 hours). We do NOT create a
    // `battles` row here — the opponent (black_player_id) isn't known yet,
    // and battles.black_player_id is NOT NULL. The /accept route creates the
    // real battles row (with both players) once someone accepts the link.
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: challenge, error: challengeErr } = await admin
      .from("battle_challenges")
      .insert({
        challenger_id: user.id,
        stake_cents: stakeCents,
        time_control: timeControl || "rapid15",
        status: "pending",
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (challengeErr || !challenge) {
      // Refund the debit
      await admin.rpc("credit_wallet", { p_user_id: user.id, p_amount_cents: stakeCents });
      return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
    }

    return NextResponse.json({ challengeId: challenge.id });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
