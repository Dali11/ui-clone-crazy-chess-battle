import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExchangeRate } from "@/lib/geo/fx";
import { loadUsdConverter, roundUsd } from "@/lib/finance/usd";
import {
  MONEY_IN_METHODS,
  REVENUE_METHODS,
  battleRakeUnits,
  depositStatus,
  fetchAll,
  normalizeCountry,
  withdrawalStatus,
} from "@/lib/finance/commandcentre";
import { COUNTRY_CURRENCY } from "@/lib/geo/currency-map";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/commandcentre/transactions
 *
 * Unified recent-transaction feed for the Command Centre: deposits,
 * withdrawals, battle rake, tournament payments, membership payments,
 * ad purchases and withdrawal fees, each row rendered in USD with the
 * original local amount alongside. READ-ONLY.
 *
 * Query params:
 *   type   deposit | withdrawal | battle_fee | tournament |
 *          membership | ad | withdrawal_fee | all (default all)
 *   status completed | pending | failed | all (default all)
 *   limit  default 50, max 200
 *   before ISO timestamp — cursor for "load older" pagination
 */

type FeedKind =
  | "deposit" | "withdrawal" | "battle_fee" | "tournament"
  | "membership" | "ad" | "withdrawal_fee";

interface FeedRow {
  id: string;
  kind: FeedKind;
  playerId: string | null;
  playerName: string | null;
  country: string | null;
  amountUsd: number | null;
  localAmount: number | null;
  localCurrency: string | null;
  status: "completed" | "pending" | "failed" | "cancelled";
  time: string;
  reference: string | null;
}

const TYPE_DEPOSIT_METHODS = [...MONEY_IN_METHODS];
const TYPE_MAP: Record<FeedKind, string[]> = {
  deposit: TYPE_DEPOSIT_METHODS,
  withdrawal: [], // separate table
  battle_fee: [], // derived from battles
  tournament: [REVENUE_METHODS.tournaments, "tournament_entry"].filter(
    (m) => m !== REVENUE_METHODS.tournaments
  ),
  membership: [REVENUE_METHODS.memberships],
  ad: [REVENUE_METHODS.ads],
  withdrawal_fee: [], // derived from withdrawals
};

export async function GET(req: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // ── Params ─────────────────────────────────────────────────────────
    const url = new URL(req.url);
    const typeParam = url.searchParams.get("type") || "all";
    const statusParam = url.searchParams.get("status") || "all";
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
    const before = url.searchParams.get("before"); // cursor
    const kinds: FeedKind[] =
      typeParam === "all"
        ? ["deposit", "withdrawal", "battle_fee", "tournament", "membership", "ad", "withdrawal_fee"]
        : [typeParam as FeedKind];

    const fx = await loadUsdConverter(admin, async () => getExchangeRate("MWK", "USD"));

    const rows: FeedRow[] = [];
    const userIds = new Set<string>();

    const statusMatch = (s: FeedRow["status"]) =>
      statusParam === "all" || s === statusParam;

    // ── Deposits-backed kinds ──────────────────────────────────────────
    const depositMethods = [...new Set(kinds.flatMap((k) => TYPE_MAP[k]))];
    if (depositMethods.length > 0) {
      const { data: deposits } = await admin
        .from("deposits")
        .select("id, user_id, amount, amount_local, currency, country, method, status, created_at, reference, pawapay_ref")
        .in("method", depositMethods)
        .lt("created_at", before ? new Date(before).toISOString() : new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(limit * 2); // overfetch so status filter still fills a page

      for (const d of deposits || []) {
        const kind: FeedKind =
          d.method === REVENUE_METHODS.memberships ? "membership"
          : d.method === REVENUE_METHODS.ads ? "ad"
          : "tournament";
        const status = depositStatus(d.status);
        // Wallet-debit rows (ads, tournament entries) are stored negative —
        // a "payment" is displayed as the magnitude the player paid.
        const paidAmount = Math.abs(Number(d.amount || 0));
        const paidLocal = d.amount_local != null ? Math.abs(Number(d.amount_local)) : null;
        rows.push({
          id: d.id,
          kind,
          playerId: d.user_id,
          playerName: null,
          country: normalizeCountry(d.country),
          amountUsd: fx.usdFromMwk(paidAmount),
          localAmount: paidLocal,
          localCurrency: d.currency || null,
          status,
          time: d.created_at,
          reference: d.pawapay_ref || d.reference || null,
        });
        if (d.user_id) userIds.add(d.user_id);
      }
    }

    // ── Withdrawals ────────────────────────────────────────────────────
    if (kinds.includes("withdrawal") || kinds.includes("withdrawal_fee")) {
      const { data: withdrawals } = await admin
        .from("withdrawals")
        .select("id, user_id, amount, amount_local, fee, currency, country, status, created_at, processed_at, pawapay_ref")
        .lt("created_at", before ? new Date(before).toISOString() : new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(limit * 2);

      for (const w of withdrawals || []) {
        if (kinds.includes("withdrawal")) {
          rows.push({
            id: w.id,
            kind: "withdrawal",
            playerId: w.user_id,
            playerName: null,
            country: normalizeCountry(w.country),
            amountUsd: fx.toUsd(Number(w.amount || 0), w.currency || "MWK"),
            localAmount: w.amount_local != null ? Number(w.amount_local) : null,
            localCurrency: w.currency || null,
            status: withdrawalStatus(w.status),
            time: w.created_at,
            reference: w.pawapay_ref || null,
          });
          if (w.user_id) userIds.add(w.user_id);
        }
        if (kinds.includes("withdrawal_fee")) {
          const fee = Math.max(0, Number(w.fee || 0));
          if (fee > 0) {
            rows.push({
              id: `${w.id}:fee`,
              kind: "withdrawal_fee",
              playerId: w.user_id,
              playerName: null,
              country: normalizeCountry(w.country),
              amountUsd: fx.toUsd(fee, w.currency || "MWK"),
              localAmount: fee,
              localCurrency: w.currency || null,
              status: withdrawalStatus(w.status),
              time: w.processed_at || w.created_at,
              reference: w.pawapay_ref || null,
            });
          }
        }
      }
    }

    // ── Battle rake (derived from settled battles) ─────────────────────
    if (kinds.includes("battle_fee")) {
      const { data: battles } = await admin
        .from("battles")
        .select("id, white_player_id, winner_id, pot, stake, winner_payout, completed_at")
        .eq("settled", true)
        .eq("status", "completed")
        .not("winner_id", "is", null)
        .lt("completed_at", before ? new Date(before).toISOString() : new Date().toISOString())
        .order("completed_at", { ascending: false })
        .limit(limit * 2);

      const battleUserIds = new Set<string>();
      const battleRows: any[] = [];
      for (const b of battles || []) {
        const rake = battleRakeUnits(b);
        if (rake <= 0) continue;
        battleRows.push(b);
        if (b.white_player_id) battleUserIds.add(b.white_player_id);
        userIds.add(b.white_player_id);
      }

      // Country here is metadata only (which market the white player is
      // in) — it does NOT change the rake's currency. stake/pot/
      // winner_payout on `battles` are always stored in MWK regardless of
      // either player's country (see api/battles/challenge/create).
      // Previously this converted the MWK rake as if it were the white
      // player's LOCAL currency, inflating non-Malawi battle revenue.
      const whiteProfiles = battleUserIds.size
        ? await admin.from("profiles").select("id, country").in("id", [...battleUserIds])
        : { data: [] as any[] };
      const whiteCountry = new Map<string, string | null>(
        (whiteProfiles.data || []).map((p: any) => [p.id, normalizeCountry(p.country)])
      );

      for (const b of battleRows) {
        const country = whiteCountry.get(b.white_player_id) || null;
        rows.push({
          id: b.id,
          kind: "battle_fee",
          playerId: b.white_player_id,
          playerName: null,
          country,
          amountUsd: fx.usdFromMwk(battleRakeUnits(b)),
          localAmount: battleRakeUnits(b),
          localCurrency: "MWK",
          status: "completed",
          time: b.completed_at,
          reference: null,
        });
      }
    }

    // ── Player names ───────────────────────────────────────────────────
    const nameIds = [...userIds].slice(0, 400);
    const nameMap = new Map<string, string>();
    if (nameIds.length > 0) {
      const { data: players } = await admin
        .from("profiles")
        .select("id, username, display_name")
        .in("id", nameIds);
      for (const p of players || []) {
        nameMap.set(p.id, p.display_name || p.username || "Unknown");
      }
    }
    for (const r of rows) {
      if (r.playerId) r.playerName = nameMap.get(r.playerId) || "Unknown";
    }

    // ── Filter + merge + page ──────────────────────────────────────────
    const filtered = rows
      .filter((r) => statusMatch(r.status))
      .sort((a, b) => Date.parse(b.time) - Date.parse(a.time))
      .slice(0, limit)
      .map((r) => ({ ...r, amountUsd: r.amountUsd == null ? null : roundUsd(r.amountUsd) }));

    return NextResponse.json({
      rows: filtered,
      nextCursor: filtered.length === limit ? filtered[filtered.length - 1].time : null,
    });
  } catch (err: any) {
    console.error("[commandcentre/transactions]", err);
    return NextResponse.json(
      { error: err?.message || "Failed to load transactions" },
      { status: 500 }
    );
  }
}
