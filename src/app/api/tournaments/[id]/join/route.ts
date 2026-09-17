import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { moneySymbol, formatMoney } from "@/lib/geo/format";
import { mwkToLocal } from "@/lib/wallet/mwk-to-local";
import { formatMoneyConverted } from "@/lib/geo/server-format";
import { runArenaMatchmakingWave } from "@/lib/tournament/arena";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const tournamentId = resolvedParams.id;

    const admin = createAdminClient();

    // Verify tournament exists and is upcoming
    const { data: tournament, error: tErr } = await admin
      .from("tournaments")
      .select("id, type, status, max_players, min_rating, max_rating, entry_fee, prize_pool, pool_source, is_player_created")
      .eq("id", tournamentId)
      .single();

    if (tErr || !tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    // Get user's currency symbol for error messages
    const { data: _userProfile } = await admin
      .from("profiles")
      .select("country")
      .eq("id", user.id)
      .single();
    const sym = moneySymbol(_userProfile?.country);

    if (tournament.status !== "upcoming" && tournament.status !== "active") {
      return NextResponse.json(
        { error: "Tournament is not accepting new participants" },
        { status: 400 }
      );
    }

    // Knockout brackets are generated once at start from the registered
    // players. A participant joining after that would never be paired into
    // any round — while still paying the entry fee — so block the join and
    // say so clearly. (Arena and swiss legitimately support late joins:
    // arena matchmaking waves and swiss per-round pairing pick up everyone.)
    if (tournament.type === "knockout" && tournament.status === "active") {
      return NextResponse.json(
        { error: "Registration is closed — knockout tournaments can't be joined after they start" },
        { status: 400 }
      );
    }

    // Check capacity if max_players is set
    if (tournament.max_players) {
      const { count } = await admin
        .from("tournament_participants")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournamentId);

      if (count !== null && count >= tournament.max_players) {
        return NextResponse.json({ error: "Tournament is full" }, { status: 400 });
      }
    }

    // Get profile using admin client (avoids RLS issues)
    const { data: profile, error: pErr } = await admin
      .from("profiles")
      .select("rating, wallet_balance")
      .eq("id", user.id)
      .single();

    if (pErr || !profile) {
      return NextResponse.json(
        { error: "Profile not found. Please complete your account setup first." },
        { status: 400 }
      );
    }

    // Enforce rating restrictions
    if (tournament.min_rating && profile.rating < tournament.min_rating) {
      return NextResponse.json(
        { error: `Minimum rating of ${tournament.min_rating} required` },
        { status: 400 }
      );
    }
    if (tournament.max_rating && profile.rating > tournament.max_rating) {
      return NextResponse.json(
        { error: `Maximum rating of ${tournament.max_rating} required` },
        { status: 400 }
      );
    }

    const entryFee = tournament.entry_fee || 0;
    let paidEntryFee = false;
    let didDebit = false; // tracks whether we actually charged the wallet this join

    // Check if this player previously paid for this tournament (withdrew without refund)
    if (entryFee > 0) {
      const { data: priorPayment } = await admin
        .from("deposits")
        .select("id")
        .eq("user_id", user.id)
        .eq("reference", `tournament:${tournamentId}:entry`)
        .eq("status", "success")
        .limit(1);

      if (priorPayment && priorPayment.length > 0) {
        // Already paid before — rejoin for free
        paidEntryFee = true;
      }
    }

    if (entryFee > 0 && !paidEntryFee) {
      // First-time payment — debit wallet
      const currentBalance = profile.wallet_balance ?? 0;
      // BUG FIX 2026-09-16: entryFee is MWK, currentBalance is already the
      // player's LOCAL wallet currency — comparing/formatting them as if
      // both were MWK rejected valid balances and double-converted the
      // "you have" figure in the error message.
      const localEntryFee = await mwkToLocal(user.id, entryFee, admin);
      if (currentBalance < localEntryFee) {
        return NextResponse.json(
          {
            error: `Insufficient wallet balance. Entry fee is ${await formatMoneyConverted(entryFee, _userProfile?.country)}. You have ${formatMoney(currentBalance, _userProfile?.country)}. Please deposit funds first.`,
          },
          { status: 402 }
        );
      }

      // Debit wallet atomically
      const { error: debitErr } = await admin.rpc("debit_wallet", {
        p_user_id: user.id,
        p_amount: entryFee,
      });

      if (debitErr) {
        console.error("Entry fee debit failed:", debitErr);
        if (debitErr.message?.includes("Insufficient balance")) {
          return NextResponse.json(
            { error: "Insufficient wallet balance. Please deposit funds first." },
            { status: 402 }
          );
        }
        return NextResponse.json(
          { error: "Failed to process entry fee. Please try again or contact support." },
          { status: 500 }
        );
      }

      paidEntryFee = true;
      didDebit = true;

      // Entry-fee accounting, by pool ownership:
      //  - entry_fees mode: fees accumulate into the gross prize pool (as before)
      //  - fixed pool (any owner): fees are tracked in entry_fees_collected.
      //    Player-created pools split them 95/5 to creator/platform at start;
      //    house pools keep them as platform revenue, netted against the
      //    fixed prize in the Command Centre (profit = fees − prize).
      // Uses an atomic RPC (single UPDATE) instead of read-then-write, which
      // silently lost increments when multiple players joined concurrently.
      if (tournament.pool_source !== 'fixed') {
        const { error: poolErr } = await admin.rpc("increment_tournament_prize_pool", {
          p_tournament_id: tournamentId,
          p_amount: entryFee,
        });

        if (poolErr) console.error("Prize pool update failed:", poolErr);
      } else {
        const { error: feesErr } = await admin.rpc("increment_tournament_entry_fees", {
          p_tournament_id: tournamentId,
          p_amount: entryFee,
        });

        if (feesErr) console.error("Entry fee collection update failed:", feesErr);
      }

      // Record deposit entry for audit trail (non-fatal — must not block the join)
      const { error: depositErr } = await admin.from("deposits").insert({
        user_id: user.id,
        amount: -entryFee,
        status: "success",
        method: "tournament_entry",
        reference: `tournament:${tournamentId}:entry`,
      });

      if (depositErr) console.error("Deposit audit log failed:", depositErr);

      // AFFILIATE FEE SHARE (2026-09-16): on PLATFORM-HOSTED fixed-pool
      // tournaments the entry fee is platform revenue, so the referrer earns
      // a share (default 25%). Entry-fee pools fund the prize — player money,
      // not revenue — so they are excluded, and player-created tournaments
      // pay affiliates nothing in any mode. Non-fatal: must not block the join.
      if (tournament.pool_source === "fixed" && !tournament.is_player_created) {
        try {
          await admin.rpc("pay_affiliate_fee_share", {
            p_user_id: user.id,
            p_fee_amount: entryFee,
            p_source: "tournament_fee",
          });
        } catch (affErr) {
          console.error("Affiliate fee share failed (non-fatal):", affErr);
        }
      }
    }

    // Join tournament
    const { data: insertedParticipant, error: joinErr } = await admin
      .from("tournament_participants")
      .insert({
        tournament_id: tournamentId,
        player_id: user.id,
        paid_entry_fee: paidEntryFee,
      })
      .select("id")
      .single();

    // Post-insert capacity check to prevent race condition
    // (two users could pass the pre-check simultaneously)
    if (!joinErr && insertedParticipant && tournament.max_players) {
      const { count: postCount } = await admin
        .from("tournament_participants")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", tournamentId);

      if (postCount !== null && postCount > tournament.max_players) {
        // We went over capacity — remove our participant and refund
        await admin
          .from("tournament_participants")
          .delete()
          .eq("id", insertedParticipant.id);

        if (didDebit) {
          await admin.rpc("credit_wallet", {
            p_user_id: user.id,
            p_amount: entryFee,
          });
        }

        return NextResponse.json(
          { error: "Tournament is full" },
          { status: 400 }
        );
      }
    }

    if (joinErr) {
      // If we actually debited the wallet this join, refund on failure
      if (didDebit) {
        await admin.rpc("credit_wallet", {
          p_user_id: user.id,
          p_amount: entryFee,
        });
      }

      if (joinErr.code === "23505") {
        return NextResponse.json(
          { error: "Already registered for this tournament" },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: joinErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: "Successfully joined tournament" });
  } catch (error: any) {
    console.error("Join tournament error:", error);
    return NextResponse.json({ error: error.message || "Failed to join tournament" }, { status: 500 });
  }
}
