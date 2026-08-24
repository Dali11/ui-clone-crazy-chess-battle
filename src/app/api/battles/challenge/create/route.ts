import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_CONFIG } from "@/lib/battles/battle-helpers";

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

    const { data: configRow } = await admin.from("battle_config").select("*").limit(1).single();
    const config = { ...DEFAULT_CONFIG, ...configRow };

    if (!config.enabled) {
      return NextResponse.json({ error: "Chess Battles are currently disabled" }, { status: 403 });
    }

    const allowedStakes = config.stake_levels as number[];
    if (!allowedStakes.includes(stakeCents)) {
      return NextResponse.json({ error: "Invalid stake level" }, { status: 400 });
    }

    const { data: activeBattle } = await admin
      .from("battles")
      .select("id")
      .or(`white_player_id.eq.${user.id},black_player_id.eq.${user.id}`)
      .in("status", ["pending", "playing", "draw_armageddon"])
      .limit(1);

    if (activeBattle && activeBattle.length > 0) {
      return NextResponse.json(
        { error: "You have an active battle. Finish it first." },
        { status: 400 }
      );
    }

    const { data: profile } = await admin
      .from("profiles")
      .select("wallet_balance_cents, games_played, referral_code, username")
      .eq("id", user.id)
      .single();
    const referralCode = profile?.referral_code || profile?.username || null;

    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const minGames = (config as any).min_games_for_battles ?? 5;
    const gamesPlayed = profile.games_played ?? 0;
    if (gamesPlayed < minGames) {
      return NextResponse.json(
        {
          error: `You need to play at least ${minGames} games before creating Battle Challenges. You have played ${gamesPlayed} so far. Play some Quick Matches to unlock Battles!`,
          needsMoreGames: true,
          gamesPlayed,
          minRequired: minGames,
        },
        { status: 403 }
      );
    }

    const balance = profile.wallet_balance_cents ?? 0;
    if (balance < stakeCents) {
      return NextResponse.json(
        { error: `Insufficient balance. You need at least MK ${(stakeCents / 100).toLocaleString()}.` },
        { status: 402 }
      );
    }

    const { error: debitErr } = await admin.rpc("debit_wallet", {
      p_user_id: user.id,
      p_amount_cents: stakeCents,
    });

    if (debitErr) {
      console.error("Challenge escrow debit failed:", debitErr);
      return NextResponse.json({ error: "Failed to lock stake. Try again." }, { status: 500 });
    }

    await admin.from("deposits").insert({
      user_id: user.id,
      amount_cents: stakeCents,
      status: "success",
      method: "battle_escrow",
      reference: `battle_challenge:${user.id}:${stakeCents}`,
    });

    // Insert with time_control if the column exists
    // All challenges expire after 10 minutes
    const insertData: any = {
      challenger_id: user.id,
      stake_cents: stakeCents,
      status: "pending",
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
    if (timeControl) {
      insertData.time_control = timeControl;
    }

    const { data: challenge, error: chErr } = await admin
      .from("battle_challenges")
      .insert(insertData)
      .select("id")
      .single();

    // Retry without time_control if column doesn't exist
    if (chErr && timeControl) {
      delete insertData.time_control;
      const { data: retryChallenge, error: retryErr } = await admin
        .from("battle_challenges")
        .insert(insertData)
        .select("id")
        .single();

      if (retryErr || !retryChallenge) {
        await admin.rpc("credit_wallet", { p_user_id: user.id, p_amount_cents: stakeCents });
        return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
      }

      const refUrl = referralCode
        ? `${process.env.NEXT_PUBLIC_SITE_URL || "https://crazychessbattles.live"}/battle-challenge/${retryChallenge.id}?ref=${referralCode}`
        : `${process.env.NEXT_PUBLIC_SITE_URL || "https://crazychessbattles.live"}/battle-challenge/${retryChallenge.id}`;
      return NextResponse.json({
        challengeId: retryChallenge.id,
        timeControl,
        url: refUrl,
      });
    }

    if (chErr || !challenge) {
      await admin.rpc("credit_wallet", { p_user_id: user.id, p_amount_cents: stakeCents });
      return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
    }

    const finalUrl = referralCode
      ? `${process.env.NEXT_PUBLIC_SITE_URL || "https://crazychessbattles.live"}/battle-challenge/${challenge.id}?ref=${referralCode}`
      : `${process.env.NEXT_PUBLIC_SITE_URL || "https://crazychessbattles.live"}/battle-challenge/${challenge.id}`;
    return NextResponse.json({
      challengeId: challenge.id,
      timeControl,
      url: finalUrl,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
