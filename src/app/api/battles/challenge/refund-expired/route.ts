import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Refund the escrowed stake for an expired battle challenge.
 *
 * Called when:
 * 1. The challenger's waiting page countdown hits zero
 * 2. The page server-render detects expires_at < now
 * 3. Someone opens an expired challenge link
 *
 * This is idempotent — it uses an atomic claim on status='pending'
 * so multiple calls (e.g. page render + client countdown firing at
 * the same time) won't double-refund.
 */
export async function POST(req: NextRequest) {
  try {
    const { challengeId } = await req.json();
    if (!challengeId) {
      return NextResponse.json({ error: "Missing challengeId" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Fetch the challenge
    const { data: challenge, error } = await admin
      .from("battle_challenges")
      .select("id, challenger_id, stake_cents, status, expires_at")
      .eq("id", challengeId)
      .single();

    if (error || !challenge) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    // Already refunded/processed — nothing to do
    if (challenge.status === "expired" || challenge.status === "cancelled") {
      return NextResponse.json({ success: true, alreadyRefunded: true });
    }

    // Only refund if it's actually expired
    if (new Date(challenge.expires_at) >= new Date()) {
      return NextResponse.json({ error: "Challenge has not expired yet" }, { status: 400 });
    }

    // Atomic claim — only succeeds if status is still 'pending'
    // This prevents double-refunds from concurrent calls
    const { data: claimed, error: claimError } = await admin
      .from("battle_challenges")
      .update({ status: "expired" })
      .eq("id", challengeId)
      .eq("status", "pending")
      .select("id, challenger_id, stake_cents")
      .single();

    if (claimError || !claimed) {
      // Someone else may have already claimed it (accepted or expired)
      return NextResponse.json({ success: true, alreadyRefunded: true });
    }

    // Refund the escrowed stake
    const { error: creditErr } = await admin.rpc("credit_wallet", {
      p_user_id: claimed.challenger_id,
      p_amount_cents: claimed.stake_cents,
    });

    if (creditErr) {
      console.error("Expired challenge refund failed:", creditErr);
      // Revert the status back to pending so they can retry
      await admin
        .from("battle_challenges")
        .update({ status: "pending" })
        .eq("id", challengeId);
      return NextResponse.json({ error: "Failed to refund stake" }, { status: 500 });
    }

    // Record the refund in deposits for audit
    const { error: depErr } = await admin.from("deposits").insert({
      user_id: claimed.challenger_id,
      amount_cents: claimed.stake_cents,
      status: "success",
      method: "battle_refund",
      reference: `expired_challenge:${challengeId}`,
    });
    if (depErr) console.error("Refund audit log failed:", depErr);

    return NextResponse.json({ success: true, refunded: claimed.stake_cents });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
