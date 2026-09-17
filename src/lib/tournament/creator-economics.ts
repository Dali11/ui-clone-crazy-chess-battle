import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Creator-led tournament economics.
 *
 * Players (non-admins) can create tournaments in two funded modes:
 *
 *  1. ENTRY-FEE FUNDED (pool_source = 'entry_fees')
 *     Entry fees accumulate into the gross prize pool exactly as before.
 *     At settlement the platform takes CREATOR_PLATFORM_FEE_PERCENT of the
 *     GROSS first, then the creator's cut (capped at
 *     MAX_CREATOR_PROFIT_PERCENT), and the remainder is the prize pool
 *     distributed to winners.
 *
 *  2. FIXED POOL (pool_source = 'fixed', player-created only)
 *     The creator's wallet is DEBITED the full prize amount at creation
 *     (escrow). Entry fees are charged to players normally but do NOT touch
 *     the prize pool: when the tournament starts, the platform keeps 5% of
 *     collected entry fees and the creator's wallet is credited the other
 *     95%. The escrowed prize is then distributed in full to winners at
 *     finish. No rake on prize money — ever.
 *
 *  3. FREE TOURNAMENTS
 *     Zero entry fee and (for players) zero escrow — pure community events,
 *     no fees anywhere.
 *
 * Admin-hosted tournaments are UNCHANGED: house-backed fixed pools with no
 * platform cut on entry-fee pools, and fixed-pool entry fees remain
 * affiliate-eligible platform revenue (creator tournaments pay affiliates
 * nothing).
 *
 * Idempotency: every money-moving helper here settles via an atomic claim on
 * `platform_fee_collected` (0 → fee), so parallel start paths (manual start,
 * cron, auto-start) can never double-credit a creator.
 */

export const CREATOR_PLATFORM_FEE_PERCENT = 5;
export const MAX_CREATOR_PROFIT_PERCENT = 25;

type AdminClient = ReturnType<typeof createAdminClient>;

export interface CreatorEligibility {
  ok: boolean;
  reason?: string;
}

/**
 * Qualification gate for player-created tournaments:
 *  - KYC identity verified, AND
 *  - proven activity: joined a tournament, OR played a game, OR
 *    (deposited funds AND played a settled staked battle).
 */
export async function checkCreatorEligibility(
  admin: AdminClient,
  userId: string
): Promise<CreatorEligibility> {
  const { data: profile } = await admin
    .from("profiles")
    .select("identity_verified")
    .eq("id", userId)
    .single();

  if (!profile?.identity_verified) {
    return {
      ok: false,
      reason:
        "Identity verification (KYC) is required to create tournaments. Complete verification in your account settings first.",
    };
  }

  const [joined, played, deposits, battles] = await Promise.all([
    admin
      .from("tournament_participants")
      .select("id")
      .eq("player_id", userId)
      .limit(1),
    admin
      .from("games")
      .select("id")
      .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
      .limit(1),
    admin
      .from("deposits")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "success")
      .in("method", ["mobile_money", "pawapay"])
      .gt("amount", 0)
      .limit(1),
    admin
      .from("battles")
      .select("id")
      .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
      .eq("settled", true)
      .limit(1),
  ]);

  const hasJoinedTournament = (joined.data || []).length > 0;
  const hasPlayedGame = (played.data || []).length > 0;
  const hasDepositedAndBattled =
    (deposits.data || []).length > 0 && (battles.data || []).length > 0;

  if (hasJoinedTournament || hasPlayedGame || hasDepositedAndBattled) {
    return { ok: true };
  }

  return {
    ok: false,
    reason:
      "You need some platform activity before creating a tournament: join a tournament, play a game, or deposit funds and play a staked battle.",
  };
}

/**
 * Escrow: debit the creator's wallet for a fixed prize pool at creation time.
 * Returns an error string on failure (caller aborts and cleans up).
 */
export async function escrowFixedPoolPrize(
  admin: AdminClient,
  tournamentId: string,
  creatorId: string,
  amountMwk: number
): Promise<string | null> {
  const { error: debitErr } = await admin.rpc("debit_wallet", {
    p_user_id: creatorId,
    p_amount: amountMwk,
  });

  if (debitErr) {
    console.error("Fixed pool escrow debit failed:", debitErr);
    if (debitErr.message?.includes("Insufficient balance")) {
      return "Insufficient wallet balance to fund the prize pool. Deposit funds first or lower the prize amount.";
    }
    return "Failed to fund the prize pool. Please try again.";
  }

  await admin
    .from("deposits")
    .insert({
      user_id: creatorId,
      amount: -amountMwk,
      status: "success",
      method: "tournament_escrow",
      reference: `tournament:${tournamentId}:escrow`,
    })
    .then(() => {}, () => {});

  return null;
}

/**
 * Called when a player-created FIXED-POOL tournament STARTS:
 * credits the creator 95% of the collected entry fees; the platform keeps
 * the other 5% (recorded on the row for revenue reporting). Idempotent —
 * safe to call from every start path.
 */
export async function settleFixedPoolEntryFees(
  admin: AdminClient,
  tournamentId: string
): Promise<void> {
  const { data: t } = await admin
    .from("tournaments")
    .select(
      "id, created_by, pool_source, is_player_created, entry_fees_collected, platform_fee_collected"
    )
    .eq("id", tournamentId)
    .single();

  if (!t || !t.is_player_created || t.pool_source !== "fixed") return;
  const collected = t.entry_fees_collected || 0;
  if (collected <= 0) return;

  const platformFee = Math.floor((collected * CREATOR_PLATFORM_FEE_PERCENT) / 100);

  // Atomic claim (0 → fee) so concurrent start paths settle exactly once.
  // A non-zero value means this tournament's entry fees were already split.
  const { data: claimed } = await admin
    .from("tournaments")
    .update({ platform_fee_collected: platformFee })
    .eq("id", t.id)
    .eq("platform_fee_collected", 0)
    .select("id");

  if (!claimed || claimed.length === 0) return;

  const creatorShare = collected - platformFee;
  if (creatorShare > 0) {
    await admin.rpc("credit_wallet", {
      p_user_id: t.created_by,
      p_amount: creatorShare,
    });
    await admin
      .from("deposits")
      .insert({
        user_id: t.created_by,
        amount: creatorShare,
        status: "success",
        method: "tournament_creator_profit",
        reference: `tournament:${t.id}:entry_share`,
      })
      .then(() => {}, () => {});
  }
}

/**
 * Called after a player-created FIXED-POOL tournament is cancelled,
 * rejected, or deleted (i.e. after the atomic status claim succeeded and
 * participant refunds are being handled):
 *
 *  - Never started (platform_fee_collected = 0): the escrowed prize pool
 *    returns to the creator in full.
 *  - Already started (entry fees were split at start): the creator's 95%
 *    share is clawed back so participants can be refunded in full — the
 *    platform absorbs its own 5%. The escrowed prize also returns to the
 *    creator since it was never distributed.
 */
export async function settlePlayerTournamentCancellation(
  admin: AdminClient,
  tournamentId: string
): Promise<void> {
  const { data: t } = await admin
    .from("tournaments")
    .select(
      "id, status, created_by, pool_source, is_player_created, prize_pool, entry_fees_collected, platform_fee_collected, escrow_settled"
    )
    .eq("id", tournamentId)
    .single();

  if (!t || !t.is_player_created || t.pool_source !== "fixed") return;
  // Only cancelled/rejected tournaments settle here; finished ones have
  // already distributed the escrowed prize.
  if (t.status !== "cancelled" && t.status !== "rejected") return;

  // Atomic claim so cancel-then-delete (or any repeated call) settles once.
  const { data: claimed } = await admin
    .from("tournaments")
    .update({ escrow_settled: true })
    .eq("id", t.id)
    .eq("escrow_settled", false)
    .select("id");
  if (!claimed || claimed.length === 0) return;

  const started = (t.platform_fee_collected || 0) > 0;

  if (started) {
    // Claw back the creator's entry-fee share (best-effort — refunding the
    // players must not be blocked by an overdrawn creator wallet).
    const creatorShare =
      (t.entry_fees_collected || 0) - (t.platform_fee_collected || 0);
    if (creatorShare > 0) {
      try {
        await admin.rpc("debit_wallet", {
          p_user_id: t.created_by,
          p_amount: creatorShare,
        });
        await admin
          .from("deposits")
          .insert({
            user_id: t.created_by,
            amount: -creatorShare,
            status: "success",
            method: "tournament_clawback",
            reference: `tournament:${t.id}:entry_share_clawback`,
          })
          .then(() => {}, () => {});
      } catch (err) {
        console.error(
          "Creator entry-share clawback failed (refund continues):",
          err
        );
      }
    }
  }

  // Escrowed prize was never distributed — return it to the creator.
  const escrow = t.prize_pool || 0;
  if (escrow > 0) {
    await admin.rpc("credit_wallet", {
      p_user_id: t.created_by,
      p_amount: escrow,
    });
    await admin
      .from("deposits")
      .insert({
        user_id: t.created_by,
        amount: escrow,
        status: "success",
        method: "tournament_escrow_refund",
        reference: `tournament:${t.id}:escrow_refund`,
      })
      .then(() => {}, () => {});
  }
}
