import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_CONFIG, calcPayout } from "@/lib/battles/battle-helpers";
import { moneySymbol } from "@/lib/geo/format";
import { formatMoneyConverted } from "@/lib/geo/server-format";

/**
 * POST /api/game/rematch/accept
 * Opponent accepts the rematch — creates the game and notifies the requester.
 * If the rematch carries a stake (staked battle rematch):
 *   - Checks both players' balances
 *   - Debits both wallets
 *   - Creates a battle record linked to the new game
 * Body: { offerId: string }
 */
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

    const { offerId } = await req.json();
    if (!offerId) return NextResponse.json({ error: "offerId required" }, { status: 400 });

    const admin = createAdminClient();

    const { data: offer } = await admin
      .from("rematch_offers")
      .select("*")
      .eq("id", offerId)
      .single();

    if (!offer) return NextResponse.json({ error: "Offer not found" }, { status: 404 });

    // Must be the opponent to accept
    if (offer.opponent_id !== user.id) {
      return NextResponse.json({ error: "Only the opponent can accept" }, { status: 403 });
    }

    if (offer.status !== "pending") {
      return NextResponse.json({ error: `Offer already ${offer.status}` }, { status: 400 });
    }

    // Check if expired
    if (new Date(offer.expires_at) < new Date()) {
      await admin.from("rematch_offers").update({ status: "expired" }).eq("id", offerId);
      return NextResponse.json({ error: "Offer expired" }, { status: 410 });
    }

    const stake = offer.stake || 0;
    const isStakedRematch = stake > 0;

    // ── Staked rematch: balance checks + escrow ──
    if (isStakedRematch) {
      // Check acceptor's (opponent's) balance
      const { data: acceptorProfile } = await admin
        .from("profiles")
        .select("rating, wallet_balance")
        .eq("id", user.id)
        .single();

      const acceptorBalance = acceptorProfile?.wallet_balance ?? 0;
      if (acceptorBalance < stake) {
        return NextResponse.json({
          error: `Insufficient balance for a staked rematch. You need ${await formatMoneyConverted(stake, _profile?.country)}.`,
          insufficientFunds: true,
          requiredAmount: stake,
          balance: acceptorBalance,
        }, { status: 402 });
      }

      // Check requester's balance too — they might have spent it since sending the offer
      const { data: requesterProfile } = await admin
        .from("profiles")
        .select("wallet_balance")
        .eq("id", offer.requester_id)
        .single();

      const requesterBalance = requesterProfile?.wallet_balance ?? 0;
      if (requesterBalance < stake) {
        return NextResponse.json({
          error: "Your opponent no longer has enough balance for this staked rematch.",
        }, { status: 402 });
      }

      // Debit acceptor's wallet
      const { error: debitAcceptor } = await admin.rpc("debit_wallet", {
        p_user_id: user.id,
        p_amount: stake,
      });
      if (debitAcceptor) {
        return NextResponse.json({ error: "Failed to lock your stake. Try again." }, { status: 500 });
      }

      // Debit requester's wallet
      const { error: debitRequester } = await admin.rpc("debit_wallet", {
        p_user_id: offer.requester_id,
        p_amount: stake,
      });
      if (debitRequester) {
        // Refund the acceptor
        await admin.rpc("credit_wallet", { p_user_id: user.id, p_amount: stake });
        return NextResponse.json({ error: "Failed to lock opponent's stake. Try again." }, { status: 500 });
      }

      // Audit logs
      await admin.from("deposits").insert([
        {
          user_id: user.id,
          amount: stake,
          status: "success",
          method: "battle_escrow",
          reference: `staked_rematch_accept:${offerId}:${user.id}`,
        },
        {
          user_id: offer.requester_id,
          amount: stake,
          status: "success",
          method: "battle_escrow",
          reference: `staked_rematch_accept:${offerId}:${offer.requester_id}`,
        },
      ]);
    }

    // Fetch player profiles for current ratings
    const [requesterProfile, opponentProfile] = await Promise.all([
      admin.from("profiles").select("rating, display_name, username").eq("id", offer.requester_id).single(),
      admin.from("profiles").select("rating, display_name, username").eq("id", user.id).single(),
    ]);

    // Swap colors from the original game:
    // If requester was white → opponent gets white in the rematch
    // If requester was black → requester gets white in the rematch
    const requesterWasWhite = offer.requester_was_white !== false;
    const newWhiteId = requesterWasWhite ? offer.opponent_id : offer.requester_id;
    const newBlackId = requesterWasWhite ? offer.requester_id : offer.opponent_id;
    const newWhiteRating = (requesterWasWhite ? opponentProfile.data : requesterProfile.data)?.rating ?? 1500;
    const newBlackRating = (requesterWasWhite ? requesterProfile.data : opponentProfile.data)?.rating ?? 1500;

    // Create the game
    const { data: newGameId, error: rpcError } = await admin.rpc("create_game", {
      p_white_id: newWhiteId,
      p_black_id: newBlackId,
      p_white_rating: newWhiteRating,
      p_black_rating: newBlackRating,
      p_time_control: offer.time_control || "blitz",
      p_initial_minutes: offer.initial_minutes ?? 5,
      p_increment_seconds: offer.increment_seconds ?? 2,
      p_rated: offer.rated ?? true,
    });

    if (rpcError || !newGameId) {
      console.error("Rematch accept create_game error:", rpcError);
      // Refund if staked
      if (isStakedRematch) {
        await admin.rpc("credit_wallet", { p_user_id: user.id, p_amount: stake });
        await admin.rpc("credit_wallet", { p_user_id: offer.requester_id, p_amount: stake });
      }
      return NextResponse.json({ error: "Failed to create rematch game" }, { status: 500 });
    }

    // Create battle record for staked rematches
    if (isStakedRematch) {
      const { data: configRow } = await admin.from("battle_config").select("*").limit(1).single();
      const config = { ...DEFAULT_CONFIG, ...configRow };
      const { pot, fee, payout } = calcPayout(stake, config.platform_fee_pct);

      const { data: battle, error: battleErr } = await admin
        .from("battles")
        .insert({
          white_player_id: newWhiteId,
          black_player_id: newBlackId,
          stake,
          pot,
          platform_fee: fee,
          winner_payout: payout,
          status: "pending",
          white_rating: newWhiteRating,
          black_rating: newBlackRating,
        })
        .select("id")
        .single();

      if (battleErr || !battle) {
        console.error("Staked rematch battle creation failed:", battleErr);
        // Refund
        await admin.rpc("credit_wallet", { p_user_id: user.id, p_amount: stake });
        await admin.rpc("credit_wallet", { p_user_id: offer.requester_id, p_amount: stake });
        return NextResponse.json({ error: "Failed to create battle for rematch" }, { status: 500 });
      }

      // Link battle to the new game AND flip status to "playing" — without
      // this, the battle stays "pending" for the entire game (game_id set
      // but status never advances), which means the /api/battles/active
      // self-heal (which only watches status="playing"/"draw_armageddon")
      // can never catch a failed fire-and-forget settleBattle() call. The
      // battle would then sit "pending" forever even after the game ends.
      await admin
        .from("battles")
        .update({ game_id: newGameId, status: "playing", started_at: new Date().toISOString() })
        .eq("id", battle.id);
    }

    // Update the offer
    await admin.from("rematch_offers").update({
      status: "accepted",
      new_game_id: newGameId,
      responded_at: new Date().toISOString(),
    }).eq("id", offerId);

    return NextResponse.json({ gameId: newGameId, offerId, stake });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
