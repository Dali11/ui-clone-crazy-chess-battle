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

      await admin.rpc("credit_wallet", { p_user_id: battle.white_player_id, p_amount: battle.stake });
      await admin.rpc("credit_wallet", { p_user_id: battle.black_player_id, p_amount: battle.stake });

      try {
        await admin.rpc("check_referral_activation", { p_user_id: battle.white_player_id, p_action: "battle" });
        await admin.rpc("check_referral_activation", { p_user_id: battle.black_player_id, p_action: "battle" });
      } catch (e) {
        console.error("Referral activation failed:", e);
      }

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
      console.error("Armageddon game creation failed:", agErr);
      throw new Error("Failed to start armageddon");
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

  try {
    await admin.rpc("check_referral_activation", { p_user_id: battle.white_player_id, p_action: "battle" });
    await admin.rpc("check_referral_activation", { p_user_id: battle.black_player_id, p_action: "battle" });
  } catch (e) {
    console.error("Referral activation failed:", e);
  }

  return { settled: true, winnerId, payout, result: result || "win" };
}
