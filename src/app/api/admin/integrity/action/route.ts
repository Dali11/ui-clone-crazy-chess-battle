import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isHeldNote } from "@/lib/integrity/detect";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/integrity/action
 * { flagId, action: "dismiss" | "confirm" | "reopen" }
 *
 * dismiss — marks the flag resolved (false positive) and RELEASES any
 *           league payouts held by it: each pending deposit flips to
 *           success and the wallet is credited. One click, money moves.
 * confirm — marks the flag confirmed cheating (payout stays held; ban
 *           remains the existing manual admin action).
 * reopen  — reopens a dismissed/confirmed flag (payouts re-hold from
 *           the next settle).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!me?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { flagId, action } = await req.json();
  if (!flagId || !["dismiss", "confirm", "reopen"].includes(action)) {
    return NextResponse.json({ error: "flagId and a valid action are required" }, { status: 400 });
  }

  const { data: flag, error: flagErr } = await admin
    .from("integrity_flags").select("id, user_id, status").eq("id", flagId).single();
  if (flagErr || !flag) return NextResponse.json({ error: "Flag not found" }, { status: 404 });

  const now = new Date().toISOString();
  const status = action === "dismiss" ? "dismissed" : action === "confirm" ? "confirmed" : "open";
  const { error: updErr } = await admin
    .from("integrity_flags")
    .update({ status, resolved_by: action === "reopen" ? null : user.id, resolved_at: action === "reopen" ? null : now, updated_at: now })
    .eq("id", flagId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  let released = 0, releasedTotal = 0;
  if (action === "dismiss") {
    // Release held league payouts: claim each pending row FIRST (atomic
    // status flip), then credit the wallet — a crash between the two can
    // be repaired from the deposit ledger without double-paying.
    const { data: held } = await admin
      .from("deposits")
      .select("id, amount, admin_notes")
      .eq("user_id", flag.user_id)
      .eq("status", "pending")
      .eq("method", "league_reward")
      .like("admin_notes", "%HELD: integrity review%");
    for (const dep of held ?? []) {
      if (!isHeldNote(dep.admin_notes)) continue;
      const { data: claimed, error: claimErr } = await admin
        .from("deposits")
        .update({ status: "success", admin_notes: `${dep.admin_notes} [released ${now}]` })
        .eq("id", dep.id)
        .eq("status", "pending")
        .select("id, amount");
      if (claimErr || !claimed?.length) continue;
      const { error: creditErr } = await admin.rpc("credit_wallet", { p_user_id: flag.user_id, p_amount: dep.amount });
      if (creditErr) {
        // Undo the claim so the payout can be retried.
        await admin.from("deposits").update({ status: "pending", admin_notes: dep.admin_notes }).eq("id", dep.id);
        console.error("[integrity] release credit failed:", creditErr);
        continue;
      }
      released++; releasedTotal += dep.amount;
    }
  }

  return NextResponse.json({ ok: true, status, released, releasedTotal });
}
