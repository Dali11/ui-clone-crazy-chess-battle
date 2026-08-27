import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";
import { DEFAULT_CONFIG, calcPayout } from "@/lib/battles/battle-helpers";

/**
 * Accept a stake-based battle challenge.
 * Debits the acceptor's stake, creates the battle row (pending), links it back
 * to the challenge. Client then calls /api/battles/start with the returned
 * battleId to create the actual chess game (same path as matchmaking).
 * Body: { challengeId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { challengeId } = await req.json();
    if (!challengeId) return NextResponse.json({ error: "Challenge ID required" }, { status: 400 });

    const admin = createAdminClient();

    const { data: challenge, error } = await admin
      .from("battle_challenges")
      .select("*")
      .eq("id", challengeId)
      .single();

    if (error || !challenge) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    if (challenge.challenger_id === user.id) {
      return NextResponse.json({ error: "You cannot accept your own challenge" }, { status: 400 });
    }

    if (challenge.expires_at && new Date(challenge.expires_at) < new Date()) {
      await admin.from("battle_challenges").update({ status: "expired" }).eq("id", challengeId);
      // Refund challenger
      await admin.rpc("credit_wallet", { p_user_id: challenge.challenger_id, p_amount: challenge.stake });
      return NextResponse.json({ error: "Challenge has expired" }, { status: 400 });
    }

    // Idempotent retry: this user already accepted this challenge (their stake is
    // already locked and the battle row already exists) — e.g. a previous attempt
    // got past accept but failed at the game-creation step. Don't re-claim or
    // re-debit, just hand back the existing battleId so the client can retry /start.
    if (challenge.status === "accepted" && challenge.acceptor_id === user.id && challenge.battle_id) {
      return NextResponse.json({ battleId: challenge.battle_id });
    }

    // Check acceptor balance BEFORE claiming (so we don't lock a challenge we can't fulfill)
    const { data: acceptorProfile } = await admin
      .from("profiles")
      .select("rating, wallet_balance")
      .eq("id", user.id)
      .single();

    if (!acceptorProfile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const balance = acceptorProfile.wallet_balance ?? 0;
    if (balance < challenge.stake) {
      return NextResponse.json(
        {
          error: `Insufficient balance. You need MK ${challenge.stake.toLocaleString()}.`,
          insufficientFunds: true,
          requiredAmount: challenge.stake,
          balance: balance,
        },
        { status: 402 }
      );
    }

    // Atomic claim — only succeeds if status is still 'pending'
    const { data: claimed, error: claimError } = await admin
      .from("battle_challenges")
      .update({ status: "accepted", acceptor_id: user.id })
      .eq("id", challengeId)
      .eq("status", "pending")
      .select("*")
      .single();

    if (claimError || !claimed) {
      return NextResponse.json({ error: "Challenge is no longer available" }, { status: 400 });
    }

    // Debit acceptor's stake
    const { error: debitErr } = await admin.rpc("debit_wallet", {
      p_user_id: user.id,
      p_amount: challenge.stake,
    });

    if (debitErr) {
      // Roll back the claim so the challenge is usable again
      await admin.from("battle_challenges").update({ status: "pending", acceptor_id: null }).eq("id", challengeId);
      return NextResponse.json({ error: "Failed to lock your stake. Try again." }, { status: 500 });
    }

    await admin.from("deposits").insert({
      user_id: user.id,
      amount: challenge.stake,
      status: "success",
      method: "battle_escrow",
      reference: `battle_challenge_accept:${user.id}:${challenge.stake}`,
    });

    const { data: configRow } = await admin.from("battle_config").select("*").limit(1).single();
    const config = { ...DEFAULT_CONFIG, ...configRow };
    const { pot, fee, payout } = calcPayout(challenge.stake, config.platform_fee_pct);

    // Random color assignment
    let whitePlayer = challenge.challenger_id;
    let blackPlayer = user.id;
    if (Math.random() > 0.5) {
      whitePlayer = user.id;
      blackPlayer = challenge.challenger_id;
    }

    const { data: challengerProfile } = await admin
      .from("profiles")
      .select("rating")
      .eq("id", challenge.challenger_id)
      .single();

    // NOTE: the `battles` table has no time_control column — the challenge's
    // time control lives on battle_challenges.time_control and is passed
    // explicitly by the client to /api/battles/start when kicking off the game.
    const { data: battle, error: battleErr } = await admin
      .from("battles")
      .insert({
        white_player_id: whitePlayer,
        black_player_id: blackPlayer,
        stake: challenge.stake,
        pot: pot,
        platform_fee: fee,
        winner_payout: payout,
        status: "pending",
        white_rating: whitePlayer === user.id ? acceptorProfile.rating ?? 1200 : challengerProfile?.rating ?? 1200,
        black_rating: blackPlayer === user.id ? acceptorProfile.rating ?? 1200 : challengerProfile?.rating ?? 1200,
      })
      .select("id")
      .single();

    if (battleErr || !battle) {
      // Refund both stakes and revert claim
      await admin.rpc("credit_wallet", { p_user_id: user.id, p_amount: challenge.stake });
      await admin.from("battle_challenges").update({ status: "pending", acceptor_id: null }).eq("id", challengeId);
      return NextResponse.json({ error: "Failed to create battle" }, { status: 500 });
    }

    await admin.from("battle_challenges").update({ battle_id: battle.id }).eq("id", challengeId);

    // Notify the challenger that their challenge was accepted — this matters
    // most when they've closed the app/tab and aren't sitting on the waiting
    // screen anymore. The in-app ActiveBattleWatcher will catch it live if
    // they're anywhere in the app; this email is the backup if they're fully
    // gone. Fire-and-forget — never block the acceptor on this.
    notifyChallengerAccepted(admin, challenge.challenger_id, user.id, challenge.stake).catch(() => {});

    return NextResponse.json({ battleId: battle.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}

async function notifyChallengerAccepted(
  admin: ReturnType<typeof createAdminClient>,
  challengerId: string,
  acceptorId: string,
  stake: number
) {
  const { data: challengerProfile } = await admin
    .from("profiles")
    .select("email, display_name, username")
    .eq("id", challengerId)
    .single();

  const { data: acceptorProfile } = await admin
    .from("profiles")
    .select("display_name, username, rating")
    .eq("id", acceptorId)
    .single();

  if (!challengerProfile?.email) return;

  const acceptorName = acceptorProfile?.display_name || acceptorProfile?.username || "An opponent";
  const stakeLabel = `MK ${stake.toLocaleString()}`;

  try {
    await sendEmail({
      to: challengerProfile.email,
      subject: `${acceptorName} accepted your ${stakeLabel} battle challenge!`,
      template: "challenge_received",
      data: {
        challengerName: acceptorName,
        stake: stake,
        acceptorName,
        acceptorRating: acceptorProfile?.rating ?? 0,
      },
    });
  } catch {}
}
