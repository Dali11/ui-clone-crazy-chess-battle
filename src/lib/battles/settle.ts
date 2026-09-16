import { createAdminClient } from "@/lib/supabase/admin";

export interface SettlementResult {
  settled: boolean;
  result?: string;
  gameId?: string;
  round?: number;
  winnerId?: string;
  payout?: number;
}

export async function settleBattle(
  battleId: string,
  winnerId: string | null,
  result: string
): Promise<SettlementResult> {
  const admin = createAdminClient();

  const { data: battle } = await admin
    .from("battles")
    .select("*")
    .eq("id", battleId)
    .single();

  if (!battle) throw new Error("Battle not found");

  if (battle.settled) {
    return { settled: true, result: "already_settled" };
  }

  if (winnerId === null) {
    // Draw — trigger armageddon
    const { data: config } = await admin.from("battle_config").select("*").limit(1).single();
    const maxRounds = config?.max_armageddon_rounds ?? 3;

    if (battle.armageddon_round >= maxRounds) {
      const { data: updated, error: guardErr } = await admin
        .from("battles")
        .update({
          status: "completed",
          result: "draw_max_armageddon",
          settled: true,
          completed_at: new Date().toISOString(),
          notes: "Refunded after max armageddon rounds",
        })
        .eq("id", battleId)
        .eq("settled", false)
        .select("id");

      if (guardErr || !updated || updated.length === 0) {
        return { settled: true, result: "already_settled" };
      }

      // AUDIT FIX 2026-09-11: the credit_wallet errors were previously
      // ignored — a transient RPC failure silently ate a player's stake
      // forever (the settled flag blocks every retry path). Check both
      // credits; only then ledger + release the escrow rows.
      const [wCredit, bCredit] = await Promise.all([
        admin.rpc("credit_wallet", { p_user_id: battle.white_player_id, p_amount: battle.stake }),
        admin.rpc("credit_wallet", { p_user_id: battle.black_player_id, p_amount: battle.stake }),
      ]);
      if (wCredit.error || bCredit.error) {
        const failedSide = wCredit.error ? "white" : bCredit.error ? "black" : "?";
        console.error(`MANUAL INTERVENTION NEEDED: Battle ${battleId} settled (draw refund) but the ${failedSide} refund failed:`, wCredit.error || bCredit.error);
        await admin
          .from("battles")
          .update({ notes: `REFUND_FAILED (${failedSide}) draw_max_armageddon at ${new Date().toISOString()}` })
          .eq("id", battleId);
        throw new Error(`Failed to refund stakes (${failedSide}) — battle marked as settled, manual intervention needed`);
      }

      // Ledger both stake refunds (unique references; idempotent on retry).
      const { error: _drawDepErr } = await admin.from("deposits").insert([
        { user_id: battle.white_player_id, amount: battle.stake, status: "success", method: "battle_refund", reference: `battle:${battleId}:draw:white` },
        { user_id: battle.black_player_id, amount: battle.stake, status: "success", method: "battle_refund", reference: `battle:${battleId}:draw:black` },
      ]);
      if (_drawDepErr) console.error("Draw refund ledger log failed:", _drawDepErr);

      await admin
        .from("battle_escrow")
        .update({ status: "refunded", released_at: new Date().toISOString() })
        .eq("battle_id", battleId);

      return { settled: true, result: "draw_refund" };
    }

    // Start armageddon round
    const armMinutes = Math.max(
      1,
      Math.round((config?.initial_minutes ?? 5) * (config?.armageddon_pct ?? 50) / 100)
    );

    const { data: agGameId, error: agErr } = await admin.rpc("create_game", {
      p_white_id: battle.black_player_id,
      p_black_id: battle.white_player_id,
      p_white_rating: battle.black_rating ?? 1200,
      p_black_rating: battle.white_rating ?? 1200,
      p_time_control: "armageddon",
      p_initial_minutes: armMinutes,
      p_increment_seconds: 0,
      p_rated: true,
    });

    if (agErr || !agGameId) {
      // AUDIT FIX 2026-09-11: this used to throw, leaving the battle
      // permanently stuck (its game is over, heal-stuck only scans
      // 'pending', and the move route never re-triggers — stakes locked
      // until an admin noticed). The fair automatic recovery for a draw
      // that can't get a decider is to refund both stakes.
      console.error("Armageddon game creation failed — falling back to refund-settle:", agErr);
      const { data: refunded, error: refundClaimErr } = await admin
        .from("battles")
        .update({
          status: "completed",
          result: "draw_armageddon_create_failed",
          settled: true,
          completed_at: new Date().toISOString(),
          notes: "Refunded — armageddon decider could not be created (fail-safe)",
        })
        .eq("id", battleId)
        .eq("settled", false)
        .select("id");

      if (!refundClaimErr && refunded && refunded.length > 0) {
        const [wCredit, bCredit] = await Promise.all([
          admin.rpc("credit_wallet", { p_user_id: battle.white_player_id, p_amount: battle.stake }),
          admin.rpc("credit_wallet", { p_user_id: battle.black_player_id, p_amount: battle.stake }),
        ]);
        if (!wCredit.error && !bCredit.error) {
          await admin.from("deposits").insert([
            { user_id: battle.white_player_id, amount: battle.stake, status: "success", method: "battle_refund", reference: `battle:${battleId}:draw:white` },
            { user_id: battle.black_player_id, amount: battle.stake, status: "success", method: "battle_refund", reference: `battle:${battleId}:draw:black` },
          ]).then(() => {}, () => {});
          await admin.from("battle_escrow").update({ status: "refunded", released_at: new Date().toISOString() }).eq("battle_id", battleId);
          return { settled: true, result: "draw_refund_armageddon_create_failed" };
        }
        console.error(`MANUAL INTERVENTION NEEDED: Battle ${battleId} refund fallback credits failed:`, wCredit.error || bCredit.error);
        await admin
          .from("battles")
          .update({ notes: `REFUND_FAILED armageddon_create_failed at ${new Date().toISOString()}` })
          .eq("id", battleId);
      }
      throw new Error("Failed to start armageddon AND refund fallback failed — manual intervention needed");
    }

    await admin
      .from("battles")
      .update({
        status: "draw_armageddon",
        armageddon_game_id: agGameId,
        armageddon_round: battle.armageddon_round + 1,
        result: `draw_armageddon_round_${battle.armageddon_round + 1}`,
      })
      .eq("id", battleId);

    return {
      settled: false,
      result: "armageddon",
      gameId: agGameId as string,
      round: battle.armageddon_round + 1,
    };
  }

  if (winnerId !== battle.white_player_id && winnerId !== battle.black_player_id) {
    throw new Error("Invalid winner");
  }

  // ATOMIC GUARD: mark as settled FIRST
  const { data: claimed, error: claimErr } = await admin
    .from("battles")
    .update({
      status: "completed",
      winner_id: winnerId,
      result: result || "win",
      settled: true,
      completed_at: new Date().toISOString(),
    })
    .eq("id", battleId)
    .eq("settled", false)
    .select("id");

  if (claimErr || !claimed || claimed.length === 0) {
    return { settled: true, result: "already_settled" };
  }

  const payout = battle.winner_payout;
  const { error: creditErr } = await admin.rpc("credit_wallet", {
    p_user_id: winnerId,
    p_amount: payout,
  });

  if (creditErr) {
    console.error(`MANUAL INTERVENTION NEEDED: Battle ${battleId} marked settled but payout of ${payout} to ${winnerId} failed`);
    await admin
      .from("battles")
      .update({ notes: `PAYOUT_FAILED to ${winnerId} at ${new Date().toISOString()} — credit the wallet manually` })
      .eq("id", battleId);
    throw new Error("Failed to pay winner — battle marked as settled, manual intervention needed");
  }

  const { error: _depErr } = await admin.from("deposits").insert({
    user_id: winnerId,
    amount: payout,
    status: "success",
    method: "battle_payout",
    reference: `battle:${battleId}:payout`,
  });
  if (_depErr) console.error("Deposit audit log failed:", _depErr);

  await admin
    .from("battle_escrow")
    .update({ status: "released", released_at: new Date().toISOString() })
    .eq("battle_id", battleId);


  // AFFILIATE FEE SHARE (2026-09-16): the referrers of both players earn a
  // configurable share (default 25%) of the rake this battle generated —
  // but only if the referred player is KYC-verified. Each player
  // effectively contributes half the fee. Non-fatal by design: a commission
  // failure must never break a cash settlement.
  try {
    const totalFee = battle.stake * 2 - payout;
    const halfFee = Math.floor(totalFee / 2);
    if (halfFee > 0) {
      const loserId = winnerId === battle.white_player_id
        ? battle.black_player_id
        : battle.white_player_id;
      await admin.rpc("pay_affiliate_fee_share", {
        p_user_id: winnerId, p_fee_amount: halfFee, p_source: "battle_fee",
      });
      await admin.rpc("pay_affiliate_fee_share", {
        p_user_id: loserId, p_fee_amount: halfFee, p_source: "battle_fee",
      });
    }
  } catch (affErr) {
    console.error(`Affiliate fee share failed for battle ${battleId} (non-fatal):`, affErr);
  }

  return { settled: true, winnerId, payout, result: result || "win" };
}
