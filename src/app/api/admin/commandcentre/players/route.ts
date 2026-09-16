import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExchangeRate } from "@/lib/geo/fx";
import { loadUsdConverter, roundUsd } from "@/lib/finance/usd";
import { COUNTRY_CURRENCY } from "@/lib/geo/currency-map";
import { buildWalletHistory, walletImpactAmount } from "@/lib/finance/phase2";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/commandcentre/players — Phase 2 player wallet ledger.
 *
 * Without ?id: player search (username / display_name), returns each
 * player's stored wallet balance (converted to USD) for quick lookup.
 *
 * With ?id: the full wallet dossier for one player:
 *   - current stored balance (player's wallet currency)
 *   - pending balance (withdrawals pending + deposits processing)
 *   - totals: deposited, withdrawn, battle winnings, fees
 *   - complete wallet history derived from the financial ledger
 *     (deposits rows of every method + withdrawals + withdrawal fees)
 *   - a derived ledger balance cross-checked against the stored balance
 *     so discrepancies are visible.
 *
 * READ-ONLY. Admin-only (401/403).
 */

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const fx = await loadUsdConverter(admin, async () => getExchangeRate("MWK", "USD"));

    // ── Search ──────────────────────────────────────────────────────────
    if (!id) {
      const q = (url.searchParams.get("q") || "").trim();
      let query = admin
        .from("profiles")
        .select("id, username, display_name, country, wallet_balance, created_at")
        .limit(40) as any;
      if (q) {
        const isUuid = /^[0-9a-f-]{36}$/i.test(q);
        query = query.or(`username.ilike.%${q}%,display_name.ilike.%${q}%,id.eq.${isUuid ? q : "00000000-0000-0000-0000-000000000000"}`);
      } else {
        query = query.order("created_at", { ascending: false });
      }
      const { data: players } = await query;
      return NextResponse.json({
        players: (players || []).map((p: any) => ({
          ...p,
          walletCurrency: COUNTRY_CURRENCY[(p.country || "").toUpperCase()] || "MWK",
          walletBalanceUsd: fx.toUsd(Number(p.wallet_balance || 0), COUNTRY_CURRENCY[(p.country || "").toUpperCase()] || "MWK"),
        })),
      });
    }

    // ── Full wallet dossier ─────────────────────────────────────────────
    const { data: player, error: pErr } = await admin
      .from("profiles")
      .select("id, username, display_name, country, wallet_balance, created_at, is_banned, membership_until")
      .eq("id", id)
      .single();
    if (pErr || !player) return NextResponse.json({ error: "Player not found" }, { status: 404 });

    const walletCurrency = COUNTRY_CURRENCY[(player.country || "").toUpperCase()] || "MWK";

    // Money movements from the ledger: every deposits row for this player
    // (all methods) + every withdrawal.
    const { data: deposits } = await admin
      .from("deposits")
      .select("id, amount, amount_local, currency, country, method, status, created_at, reference, pawapay_ref")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(2000);
    const { data: withdrawals } = await admin
      .from("withdrawals")
      .select("id, amount, amount_local, fee, currency, country, status, created_at, processed_at, pawapay_ref")
      .eq("user_id", id)
      .order("created_at", { ascending: false })
      .limit(2000);

    const history = buildWalletHistory(deposits || [], withdrawals || []);

    // ── Totals (settled rows only) ───────────────────────────────────────
    let totalDepositedMwk = 0;   // external money-in, success
    let totalWithdrawnMwk = 0;   // completed withdrawals, gross
    let totalWinningsMwk = 0;    // battle_payout credits, success
    let totalFeesMwk = 0;        // withdrawal fees on completed rows
    let pendingDepositsMwk = 0;
    let pendingWithdrawalsMwk = 0;
    let derivedMwk = 0;

    const MONEY_IN = ["mobile_money", "card", "bank_transfer", "pawapay", "paychangu"];
    for (const d of deposits || []) {
      // Wallet-impact sign: escrow rows are stored positive but lock the
      // stake away from the player's wallet.
      const amt = walletImpactAmount(d.method, Number(d.amount || 0));
      const mag = Math.abs(amt);
      if (d.status === "success") {
        derivedMwk += amt;
        if (MONEY_IN.includes(d.method)) totalDepositedMwk += mag;
        if (d.method === "battle_payout") totalWinningsMwk += mag;
      } else if (d.status === "pending" || d.status === "processing") {
        if (MONEY_IN.includes(d.method)) pendingDepositsMwk += mag;
      }
    }
    for (const w of withdrawals || []) {
      const gross = Math.abs(Number(w.amount || 0));
      const fee = Math.max(0, Number(w.fee || 0));
      if (w.status === "completed") {
        derivedMwk -= gross;
        totalWithdrawnMwk += gross;
        totalFeesMwk += fee;
      } else if (w.status === "pending" || w.status === "approved") {
        pendingWithdrawalsMwk += gross;
      }
    }

    const storedBalance = Number(player.wallet_balance || 0);
    const storedBalanceUsd = fx.toUsd(storedBalance, walletCurrency);
    // The derived ledger balance is in MWK-normalized units; the stored
    // balance is in the player's wallet currency — compare in USD.
    const derivedUsd = fx.usdFromMwk(derivedMwk);
    const discrepancy =
      derivedUsd != null && storedBalanceUsd != null
        ? roundUsd(Math.abs(derivedUsd - storedBalanceUsd))
        : null;

    return NextResponse.json({
      player: {
        ...player,
        walletCurrency,
        storedBalanceUsd,
      },
      totals: {
        totalDepositedMwk,
        totalWithdrawnMwk,
        totalWinningsMwk,
        totalFeesMwk,
        pendingDepositsMwk,
        pendingWithdrawalsMwk,
        derivedLedgerMwk: derivedMwk,
        derivedLedgerUsd: derivedUsd != null ? roundUsd(derivedUsd) : null,
        storedBalanceUsd: storedBalanceUsd != null ? roundUsd(storedBalanceUsd) : null,
        discrepancyUsd: discrepancy,
        entryCount: history.length,
      },
      history,
    });
  } catch (e: any) {
    console.error("Phase 2 players error:", e);
    return NextResponse.json({ error: "Failed to fetch wallet" }, { status: 500 });
  }
}
