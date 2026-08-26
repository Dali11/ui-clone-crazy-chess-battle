import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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
      .select("id, status, max_players, min_rating, max_rating, entry_fee_cents, prize_pool_cents, pool_source")
      .eq("id", tournamentId)
      .single();

    if (tErr || !tournament) {
      return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
    }

    if (tournament.status !== "upcoming") {
      return NextResponse.json(
        { error: "Tournament is not accepting new participants" },
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
      .select("rating, wallet_balance_cents")
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

    const entryFee = tournament.entry_fee_cents || 0;
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
      const currentBalance = profile.wallet_balance_cents ?? 0;
      if (currentBalance < entryFee) {
        const feeMwk = Math.floor(entryFee / 100);
        return NextResponse.json(
          {
            error: `Insufficient wallet balance. Entry fee is MWK ${feeMwk.toLocaleString()}. You have MWK ${Math.floor(currentBalance / 100).toLocaleString()}. Please deposit funds first.`,
          },
          { status: 402 }
        );
      }

      // Debit wallet atomically
      const { error: debitErr } = await admin.rpc("debit_wallet", {
        p_user_id: user.id,
        p_amount_cents: entryFee,
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

      // Add entry fee to prize pool ONLY if pool_source is 'entry_fees' (not 'fixed')
      if (tournament.pool_source !== 'fixed') {
        const { error: poolErr } = await admin
          .from("tournaments")
          .update({
            prize_pool_cents: (tournament.prize_pool_cents || 0) + entryFee,
          })
          .eq("id", tournamentId);

        if (poolErr) console.error("Prize pool update failed:", poolErr);
      }

      // Record deposit entry for audit trail (non-fatal — must not block the join)
      const { error: depositErr } = await admin.from("deposits").insert({
        user_id: user.id,
        amount_cents: -entryFee,
        status: "success",
        method: "tournament_entry",
        reference: `tournament:${tournamentId}:entry`,
      });

      if (depositErr) console.error("Deposit audit log failed:", depositErr);
    }

    // Join tournament
    const { error: joinErr } = await admin
      .from("tournament_participants")
      .insert({
        tournament_id: tournamentId,
        player_id: user.id,
        paid_entry_fee: paidEntryFee,
      });

    if (joinErr) {
      // If we actually debited the wallet this join, refund on failure
      if (didDebit) {
        await admin.rpc("credit_wallet", {
          p_user_id: user.id,
          p_amount_cents: entryFee,
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

    // Trigger referral activation for joining a tournament (non-fatal)
    const { error: refErr } = await admin.rpc("check_referral_activation", {
      p_user_id: user.id,
      p_action: "tournament",
    });
    if (refErr) console.error("Referral activation failed:", refErr);

    // Award 50 berries for joining a tournament (non-fatal)
    try {
      const { data: tConfig } = await admin
        .from("berry_config")
        .select("enabled")
        .limit(1)
        .single();
      if (tConfig?.enabled) {
        await admin.rpc("credit_berries", {
          p_user_id: user.id,
          p_amount: 50,
          p_description: "Joined a tournament!",
        });
      }
    } catch (berryErr) {
      console.error("Berry award failed:", berryErr);
    }

    return NextResponse.json({ success: true, paidEntryFee, berriesAwarded: 50 });
  } catch (e: any) {
    console.error("Join tournament error:", e);
    return NextResponse.json(
      { error: e.message || "Failed to join tournament" },
      { status: 500 }
    );
  }
}
