import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { getPlatformConfig } from "@/lib/platform-config";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { stake, timeControl } = await req.json();
    if (!stake || stake <= 0) {
      return NextResponse.json({ error: "Invalid stake amount" }, { status: 400 });
    }

    const admin = createAdminClient();

    // ─── Load platform config ──────────────────────────────────────────
    let bConfig: Record<string, any>;
    try {
      bConfig = await getPlatformConfig(admin, "battles");
    } catch (cfgErr: any) {
      console.error("[challenge/create] getPlatformConfig failed:", cfgErr?.message);
      bConfig = { enabled: true }; // fallback to defaults
    }

    // Check if battles are enabled
    if (!bConfig.enabled) {
      return NextResponse.json({ error: "Chess Battles are currently disabled" }, { status: 403 });
    }

    // Check active battle
    const { data: activeBattle, error: activeErr } = await admin
      .from("battles")
      .select("id")
      .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
      .in("status", ["pending", "playing", "draw_armageddon"])
      .limit(1);

    if (activeErr) {
      console.error("[challenge/create] active battle check error:", activeErr.message);
    }

    if (activeBattle && activeBattle.length > 0) {
      return NextResponse.json({ error: "You have an active battle. Finish it first." }, { status: 400 });
    }

    // Check wallet balance
    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("wallet_balance")
      .eq("id", user.id)
      .single();

    if (profileErr) {
      console.error("[challenge/create] profile fetch error:", profileErr.message);
      return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
    }

    if ((profile?.wallet_balance || 0) < stake) {
      return NextResponse.json({ error: "Insufficient wallet balance" }, { status: 400 });
    }

    // Debit the challenger's stake into escrow
    const { error: debitErr } = await admin.rpc("debit_wallet", {
      p_user_id: user.id,
      p_amount: stake,
    });

    if (debitErr) {
      console.error("[challenge/create] debit_wallet error:", debitErr.message);
      return NextResponse.json({ error: "Failed to lock stake. Try again." }, { status: 500 });
    }

    // Record the escrow deposit
    const { error: depositErr } = await admin.from("deposits").insert({
      user_id: user.id,
      amount: stake,
      status: "success",
      method: "battle_challenge_escrow",
      reference: `battle_challenge_create:${user.id}:${stake}`,
    });

    if (depositErr) {
      console.error("[challenge/create] deposit insert error:", depositErr.message);
      // Non-fatal — the wallet debit already happened, don't block challenge creation
    }

    // Create the challenge record (expires in 24 hours)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { data: challenge, error: challengeErr } = await admin
      .from("battle_challenges")
      .insert({
        challenger_id: user.id,
        stake: stake,
        time_control: timeControl || "rapid15",
        status: "pending",
        expires_at: expiresAt,
      })
      .select("id")
      .single();

    if (challengeErr || !challenge) {
      console.error("[challenge/create] challenge insert error:", challengeErr?.message || "no row returned");
      // Refund the debit
      await admin.rpc("credit_wallet", { p_user_id: user.id, p_amount: stake });
      return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
    }

    return NextResponse.json({ challengeId: challenge.id });
  } catch (err: any) {
    console.error("[challenge/create] unexpected error:", err?.message, err?.stack);
    return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
  }
}
