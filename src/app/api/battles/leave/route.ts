import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Leave a Battle queue — refunds the locked stake.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Find the player's waiting queue entry
    const { data: queueEntry } = await admin
      .from("battle_queue")
      .select("id, stake")
      .eq("player_id", user.id)
      .eq("status", "waiting")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!queueEntry) {
      return NextResponse.json({ error: "Not in any battle queue" }, { status: 400 });
    }

    // Atomic claim FIRST — mark this entry "left" before refunding, and only
    // proceed if THIS request is the one that actually flipped it. Without
    // this, two near-simultaneous /leave calls (double-tap on Cancel, or a
    // client retry after a slow response) both see status="waiting" and
    // both credit the wallet — a real duplicate refund a player hit today.
    const { data: claimed } = await admin
      .from("battle_queue")
      .update({ status: "left" })
      .eq("id", queueEntry.id)
      .eq("status", "waiting")
      .select("id")
      .maybeSingle();

    if (!claimed) {
      // Already left/matched by a concurrent request — refund already
      // handled by whichever call won the race. Not an error to the client.
      return NextResponse.json({ success: true, refunded: 0, alreadyLeft: true });
    }

    // Refund the locked stake
    const { error: creditErr } = await admin.rpc("credit_wallet", {
      p_user_id: user.id,
      p_amount: queueEntry.stake,
    });

    if (creditErr) {
      console.error("Refund failed:", creditErr);
      // Roll back the claim so a retry (or heal-stuck) can still refund this
      await admin.from("battle_queue").update({ status: "waiting" }).eq("id", queueEntry.id);
      return NextResponse.json({ error: "Failed to refund stake" }, { status: 500 });
    }

    // Record refund
    const { error: _depErr } = await admin.from("deposits").insert({
      user_id: user.id,
      amount: queueEntry.stake,
      status: "success",
      method: "battle_refund",
      reference: `battle_queue_refund:${queueEntry.id}`,
    });
    if (_depErr) console.error("Deposit audit log failed:", _depErr);

    return NextResponse.json({ success: true, refunded: queueEntry.stake });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to leave queue" }, { status: 500 });
  }
}
