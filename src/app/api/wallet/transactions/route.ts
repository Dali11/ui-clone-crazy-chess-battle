import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLedgerMeta, ledgerDisplayAmount, WITHDRAWAL_META } from "@/lib/wallet-ledger";

/**
 * Unified transaction history for the wallet page.
 * Combines deposits (which is actually a general wallet ledger — real cash
 * deposits AND battle escrow/payouts/refunds AND tournament entries/prizes
 * AND admin corrections, all distinguished by `method`) with withdrawals
 * into a single, correctly-signed timeline. Every row is pre-classified as
 * inflow ("in") or outflow ("out") via the shared wallet-ledger helper so
 * the UI can color it green/red consistently without guessing from the
 * raw stored amount sign (which is NOT reliable — e.g. escrow rows are
 * stored positive even though they're money leaving the wallet).
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
      direction: "in" | "out";
      amount: number;
      status: string;
      description: string;
      created_at: string;
    };

    const transactions: Txn[] = [];

    // All wallet ledger rows (deposits table = real deposits + internal movements)
    try {
      const { data: rows } = await admin
        .from("deposits")
        .select("id, amount, status, method, created_at, reference")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      for (const r of rows || []) {
        const meta = getLedgerMeta(r.method);
        transactions.push({
          id: r.id,
          direction: meta.direction,
          amount: ledgerDisplayAmount(r.amount, meta.direction),
          status: r.status,
          description: meta.label,
          created_at: r.created_at,
        });
      }
    } catch {}

    // Withdrawals — always outflow
    try {
      const { data: withdrawals } = await admin
        .from("withdrawals")
        .select("id, amount, net_amount, status, operator_name, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(limit);
      for (const w of withdrawals || []) {
        transactions.push({
          id: w.id,
          direction: "out",
          amount: ledgerDisplayAmount(w.net_amount ?? w.amount, WITHDRAWAL_META.direction),
          status: w.status,
          description: `Withdrawal via ${w.operator_name || "mobile money"}`,
          created_at: w.created_at,
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
