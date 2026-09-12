import { NextRequest, NextResponse } from "next/server";
import { removeBattleChallengeDMs } from "@/lib/chat/challenge-messages";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cancel a pending battle challenge and refund the challenger's escrowed stake.
 * Only the challenger can cancel, and only while status is 'pending'.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { challengeId } = await req.json();
    if (!challengeId) {
      return NextResponse.json({ error: "Missing challengeId" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: challenge, error } = await admin
      .from("battle_challenges")
      .select("id, challenger_id, stake, status")
      .eq("id", challengeId)
      .single();

    if (error || !challenge) {
      return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
    }

    if (challenge.challenger_id !== user.id) {
      return NextResponse.json({ error: "Only the challenger can cancel" }, { status: 403 });
    }

    if (challenge.status !== "pending") {
      return NextResponse.json({ error: "Challenge is no longer pending" }, { status: 400 });
    }

    // Atomic claim — only succeeds if status is still 'pending'
    const { data: claimed, error: claimError } = await admin
      .from("battle_challenges")
      .update({ status: "cancelled" })
      .eq("id", challengeId)
      .eq("status", "pending")
      .select("id, challenger_id, stake")
      .single();

    if (claimError || !claimed) {
      return NextResponse.json({ error: "Challenge was already accepted or cancelled" }, { status: 400 });
    }

    // Refund the escrowed stake
    const { error: creditErr } = await admin.rpc("credit_wallet", {
      p_user_id: claimed.challenger_id,
      p_amount: claimed.stake,
    });

    if (creditErr) {
      // Revert status so they can retry
      await admin.from("battle_challenges").update({ status: "pending" }).eq("id", challengeId);
      return NextResponse.json({ error: "Failed to refund stake" }, { status: 500 });
    }

    // Cancelled — the invite DMs disappear from every recipient's chat.
    await removeBattleChallengeDMs(admin, challengeId);

    // Audit log
    await admin.from("deposits").insert({
      user_id: claimed.challenger_id,
      amount: claimed.stake,
      status: "success",
      method: "battle_challenge_cancel",
      reference: `cancel:${challengeId}`,
    });

    return NextResponse.json({ success: true, refunded: claimed.stake });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
