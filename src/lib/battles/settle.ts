import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email";

/**
 * Core battle settlement logic — extracted so it can be called directly
 * instead of via internal HTTP fetch (which hangs in Vercel serverless).
 *
 * Returns: { settled: boolean, result?: string, gameId?: string, round?: number, winnerId?: string, payout?: number }
 */
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

  // Load battle
  const { data: battle } = await admin
    .from("battles")
    .select("*")
    .eq("id", battleId)
    .single();

  if (!battle) throw new Error("Battle not found");

  // Prevent double settlement (early check for performance)
  if (battle.settled) {
    return { settled: true, result: "already_settled" };
  }

  if (winnerId === null) {
    // Draw — trigger armageddon
    const { data: config } = await admin.from("battle_config").select("*").limit(1).single();
    const maxRounds = config?.max_armageddon_rounds ?? 3;

    if (battle.armageddon_round >= maxRounds) {
      // Max armageddon rounds reached — split the pot (refund both stakes)

      // ATOMIC GUARD: only update if not already settled
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
        // Someone else already settled this battle
        return { settled: true, result: "already_settled" };
      }

      // We won the race — safe to refund
      await admin.rpc("credit_wallet", {
        p_user_id: battle.white_player_id,
        p_amount: battle.stake,
      });
      await admin.rpc("credit_wallet", {
        p_user_id: battle.black_player_id,
        p_amount: battle.stake,
      });

      // Trigger referral activation for both players (non-fatal)
      try {
        await admin.rpc("check_referral_activation", { p_user_id: battle.white_player_id, p_action: "battle" });
        await admin.rpc("check_referral_activation", { p_user_id: battle.black_player_id, p_action: "battle" });
      } catch (e) {
        console.error("Referral activation failed:", e);
      }

      // Release escrow
      await admin
        .from("battle_escrow")
        .update({ status: "refunded", released_at: new Date().toISOString() })
        .eq("battle_id", battleId);

      // Notify both players of draw refund (fire-and-forget)
      const { data: drawProfiles } = await admin
        .from("profiles")
        .select("email, display_name")
        .in("id", [battle.white_player_id, battle.black_player_id]);
      for (const p of drawProfiles || []) {
        if (p.email) {
          sendEmail({
            to: p.email,
            subject: `Battle ended in draw — MK ${battle.stake.toLocaleString()} refunded`,
            template: "game_result",
            data: {
              result: "draw",
              stake: battle.stake,
              refundAmount: battle.stake,
              battleId,
            },
          }).catch(() => {});
        }
      }

      return { settled: true, result: "draw_refund" };
    }

    // Start armageddon round
    const armMinutes = Math.max(
      1,
      Math.round((config?.initial_minutes ?? 5) * (config?.armageddon_pct ?? 50) / 100)
    );

    // Create armageddon game (swap colors)
    const { data: agGameId, error: agErr } = await admin.rpc("create_game", {
      p_white_id: battle.black_player_id, // swap colors
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

  // Validate winner is a participant
  if (winnerId !== battle.white_player_id && winnerId !== battle.black_player_id) {
    throw new Error("Invalid winner");
  }

  // ATOMIC GUARD: mark as settled FIRST, only if not already settled.
  // This prevents the race where two concurrent calls both see settled=false
  // and both credit the winner. The UPDATE is atomic at the DB level.
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
    // Someone else already settled this battle
    return { settled: true, result: "already_settled" };
  }

  // We won the race — battle is now marked as settled. Safe to pay the winner.
  const payout = battle.winner_payout;
  const { error: creditErr } = await admin.rpc("credit_wallet", {
    p_user_id: winnerId,
    p_amount: payout,
  });

  if (creditErr) {
    console.error("Winner payout failed (battle already marked settled):", creditErr);
    // Battle is marked settled but payout failed — log for manual review
    // Don't throw here because that could trigger a retry which would see settled=true
    // and skip the payout entirely. Instead, record the error for manual intervention.
    console.error(`MANUAL INTERVENTION NEEDED: Battle ${battleId} marked settled but payout of ${payout} to ${winnerId} failed`);
    throw new Error("Failed to pay winner — battle marked as settled, manual intervention needed");
  }

  // Record payout (non-fatal audit trail)
  const { error: _depErr } = await admin.from("deposits").insert({
    user_id: winnerId,
    amount: payout,
    status: "success",
    method: "battle_payout",
    reference: `battle:${battleId}:payout`,
  });
  if (_depErr) console.error("Deposit audit log failed:", _depErr);

  // Release escrow
  await admin
    .from("battle_escrow")
    .update({ status: "released", released_at: new Date().toISOString() })
    .eq("battle_id", battleId);

  // Trigger referral activation for both players (non-fatal)
  try {
    await admin.rpc("check_referral_activation", { p_user_id: battle.white_player_id, p_action: "battle" });
    await admin.rpc("check_referral_activation", { p_user_id: battle.black_player_id, p_action: "battle" });
  } catch (e) {
    console.error("Referral activation failed:", e);
  }

  // Notify both players of the result (fire-and-forget)
  const loserId = winnerId === battle.white_player_id ? battle.black_player_id : battle.white_player_id;
  const { data: battleProfiles } = await admin
    .from("profiles")
    .select("id, email, display_name")
    .in("id", [battle.white_player_id, battle.black_player_id]);
  for (const p of battleProfiles || []) {
    if (p.email) {
      const isWinner = p.id === winnerId;
      sendEmail({
        to: p.email,
        subject: isWinner
          ? `You won MK ${payout.toLocaleString()} — Battle complete!`
          : `Battle result — You lost MK ${battle.stake.toLocaleString()}`,
        template: "game_result",
        data: {
          result: isWinner ? "win" : "loss",
          payout: isWinner ? payout : 0,
          stake: battle.stake,
          battleId,
          opponentName: battleProfiles?.find((pp: any) => pp.id !== p.id)?.display_name || "Opponent",
        },
      }).catch(() => {});
    }
  }

  return { settled: true, winnerId, payout, result: result || "win" };
}
