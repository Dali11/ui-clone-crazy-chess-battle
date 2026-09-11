import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_CONFIG, calcPayout } from "@/lib/battles/battle-helpers";
import { moneySymbol } from "@/lib/geo/format";
import { formatMoneyConverted } from "@/lib/geo/server-format";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch user's country for currency display
  const { data: _profile } = await supabase
    .from("profiles")
    .select("country")
    .eq("id", user.id)
    .single();
  const sym = moneySymbol(_profile?.country);

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
      // ATOMIC CLAIM: only refund if we successfully claim this row
      const { data: claimed } = await admin
        .from("battle_challenges")
        .update({ status: "expired" })
        .eq("id", challengeId)
        .eq("status", "pending")
        .select("id, challenger_id, stake")
        .single();

      if (claimed) {
        // AUDIT FIX 2026-09-11: the credit error was ignored — a transient
        // failure silently ate the challenger's stake (status said expired,
        // so no retry path would ever fire). Revert on failure so
        // refund-expired / cleanup-expired can retry.
        const { error: creditErr } = await admin.rpc("credit_wallet", {
          p_user_id: claimed.challenger_id,
          p_amount: claimed.stake,
        });
        if (creditErr) {
          console.error("[challenge/accept] expired-challenge refund failed:", creditErr);
          await admin.from("battle_challenges").update({ status: "pending" }).eq("id", challengeId);
          return NextResponse.json({ error: "Challenge has expired — refund pending, try again shortly" }, { status: 500 });
        }
        await admin.from("deposits").insert({
          user_id: claimed.challenger_id,
          amount: claimed.stake,
          status: "success",
          method: "battle_refund",
          reference: `expired_challenge:${challengeId}`,
        }).then(() => {}, () => {});
      }
      return NextResponse.json({ error: "Challenge has expired" }, { status: 400 });
    }

    if (challenge.status === "accepted" && challenge.acceptor_id === user.id && challenge.battle_id) {
      return NextResponse.json({ battleId: challenge.battle_id });
    }

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
          error: `Insufficient balance. You need ${await formatMoneyConverted(challenge.stake, _profile?.country)}.`,
          insufficientFunds: true,
          requiredAmount: challenge.stake,
          balance: balance,
        },
        { status: 402 }
      );
    }

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

    const { error: debitErr } = await admin.rpc("debit_wallet", {
      p_user_id: user.id,
      p_amount: challenge.stake,
    });

    if (debitErr) {
      await admin.from("battle_challenges").update({ status: "pending", acceptor_id: null }).eq("id", challengeId);
      return NextResponse.json({ error: "Failed to lock your stake. Try again." }, { status: 500 });
    }

    await admin.from("deposits").insert({
      user_id: user.id,
      amount: challenge.stake,
      status: "success",
      method: "battle_escrow",
      reference: `battle_challenge_accept:${challenge.id}:${user.id}`,
    }).then(() => {}, (e: any) => console.error("[challenge/accept] escrow ledger insert failed:", e?.message));

    const { data: configRow } = await admin.from("battle_config").select("*").limit(1).single();
    const config = { ...DEFAULT_CONFIG, ...configRow };
    const { pot, fee, payout } = calcPayout(challenge.stake, config.platform_fee_pct);

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
        time_control: challenge.time_control || "rapid15",
      })
      .select("id")
      .single();

    if (battleErr || !battle) {
      await admin.rpc("credit_wallet", { p_user_id: user.id, p_amount: challenge.stake });
      await admin.from("battle_challenges").update({ status: "pending", acceptor_id: null }).eq("id", challengeId);
      return NextResponse.json({ error: "Failed to create battle" }, { status: 500 });
    }

    await admin.from("battle_challenges").update({ battle_id: battle.id }).eq("id", challengeId);

    // AUDIT FIX 2026-09-11: record both stakes in battle_escrow so the
    // admin panel / audit views can see escrow state for challenge battles
    // (previously only queue-matched battles had escrow rows).
    await admin.from("battle_escrow").insert([
      { battle_id: battle.id, player_id: challenge.challenger_id, amount: challenge.stake, status: "locked" },
      { battle_id: battle.id, player_id: user.id, amount: challenge.stake, status: "locked" },
    ]).then(() => {}, (e: any) => console.error("[challenge/accept] escrow insert failed:", e?.message));

    // Insert in-app notification for challenger
    try {
      await admin.from("notifications").insert({
        user_id: challenge.challenger_id,
        type: "challenge_accepted",
        title: "Challenge accepted!",
        body: `Your battle challenge (${await formatMoneyConverted(challenge.stake, _profile?.country)}) was accepted. Clocks wait up to 2 minutes for you to join the board!`,
        data: { battle_id: battle.id, stake: challenge.stake },
        read: false,
      });
    } catch {}

    return NextResponse.json({ battleId: battle.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
