import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Unified transaction history for the wallet page.
 * Combines deposits, withdrawals, and battle payouts into a single timeline.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50");

    type Txn = {
      id: string;
      type: "deposit" | "withdrawal" | "battle_payout" | "battle_stake" | "tournament_entry" | "tournament_prize";
      amount: number;
      status: string;
      description: string;
      created_at: string;
    };

    const transactions: Txn[] = [];

    // Fetch deposits (non-fatal)
    try {
      const { data: deposits } = await admin
        .from("deposits")
        .select("id, amount, status, method, created_at, reference")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      for (const d of deposits || []) {
        transactions.push({
          id: d.id,
          type: "deposit",
          amount: d.amount,
          status: d.status,
          description: d.method === "mobile_money" ? "Mobile Money deposit" : d.method === "card" ? "Card deposit" : `Deposit (${d.method || "unknown"})`,
          created_at: d.created_at,
        });
      }
    } catch {}

    // Fetch withdrawals (non-fatal)
    try {
      const { data: withdrawals } = await admin
        .from("withdrawals")
        .select("id, amount, status, operator_name, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      for (const w of withdrawals || []) {
        transactions.push({
          id: w.id,
          type: "withdrawal",
          amount: -w.amount,
          status: w.status,
          description: `Withdrawal via ${w.operator_name || "mobile money"}`,
          created_at: w.created_at,
        });
      }
    } catch {}

    // Fetch battle payouts (from deposits table where method = battle_payout)
    try {
      const { data: battlePayouts } = await admin
        .from("deposits")
        .select("id, amount, status, reference, created_at")
        .eq("user_id", user.id)
        .eq("method", "battle_payout")
        .order("created_at", { ascending: false })
        .limit(limit);
      for (const b of battlePayouts || []) {
        transactions.push({
          id: b.id,
          type: "battle_payout",
          amount: b.amount,
          status: b.status,
          description: b.reference || "Battle winnings",
          created_at: b.created_at,
        });
      }
    } catch {}

    // Sort all by date descending
    transactions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return NextResponse.json({
      transactions: transactions.slice(0, limit),
    });
  } catch (e: any) {
    return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
  }
}
