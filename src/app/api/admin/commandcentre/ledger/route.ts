import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExchangeRate } from "@/lib/geo/fx";
import { loadUsdConverter, roundUsd } from "@/lib/finance/usd";
import { normalizeCountry } from "@/lib/finance/commandcentre";
import {
  LEDGER_TYPE_LABELS,
  METHOD_LEDGER_TYPE,
  csvEscape,
  csvResponse,
  ledgerTypeForMethod,
  type LedgerType,
} from "@/lib/finance/phase2";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/commandcentre/ledger — Phase 2 unified transaction ledger.
 *
 * Every money movement, one table: deposits (all ledger methods), 
 * withdrawals and withdrawal fees. Each row shows the CrazyChess id,
 * provider reference, player, country, original amount/currency, USD
 * equivalent, type, status and timestamp.
 *
 * Query params:
 *   type      LedgerType | all      (deposit, withdrawal, battle_fee, …)
 *   status    completed | pending | failed | cancelled | all
 *   country   ISO-2 code | all
 *   player    free-text search (username / display_name / uuid)
 *   from, to  YYYY-MM-DD (created_at window)
 *   min, max  amount filter (local currency amount)
 *   sort      time (default) | amount
 *   order     desc (default) | asc
 *   page      0-based page index
 *   limit     default 50, max 200
 *   format    csv → full export (max 10 000 rows)
 *
 * READ-ONLY. Admin-only (401/403) — same gate as the other Phase 2 routes.
 */

const LEDGER_TYPES = Object.keys(LEDGER_TYPE_LABELS) as LedgerType[];

interface LedgerRow {
  id: string;
  type: LedgerType;
  method: string;
  provider: string | null;
  providerRef: string | null;
  playerId: string | null;
  playerName: string | null;
  country: string | null;
  localAmount: number | null;
  localCurrency: string | null;
  amountUsd: number | null;
  amountMwk: number;
  status: string;
  time: string;
  reference: string | null;
}

export async function GET(req: NextRequest) {
  try {
    // ── Auth (same three-layer gate as Phase 1) ────────────────────────
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // ── Params ──────────────────────────────────────────────────────────
    const url = new URL(req.url);
    const type = url.searchParams.get("type") || "all";
    const status = url.searchParams.get("status") || "all";
    const country = url.searchParams.get("country") || "all";
    const player = (url.searchParams.get("player") || "").trim();
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const min = Number(url.searchParams.get("min")) || null;
    const max = Number(url.searchParams.get("max")) || null;
    const sort = url.searchParams.get("sort") === "amount" ? "amount" : "time";
    const order = url.searchParams.get("order") === "asc" ? "asc" : "desc";
    const format = url.searchParams.get("format");
    const page = Math.max(Number(url.searchParams.get("page")) || 0, 0);
    const limit = format === "csv" ? 10000 : Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);

    // ── Resolve player filter → user ids ────────────────────────────────
    let playerIds: string[] | null = null;
    let playerNames = new Map<string, string>();
    if (player) {
      const isUuid = /^[0-9a-f-]{36}$/i.test(player);
      const { data: matches } = await admin
        .from("profiles")
        .select("id, username, display_name")
        .or(`username.ilike.%${player}%,display_name.ilike.%${player}%,id.eq.${isUuid ? player : "00000000-0000-0000-0000-000000000000"}`)
        .limit(100);
      playerIds = (matches || []).map((m: any) => m.id);
      for (const m of matches || []) playerNames.set(m.id, m.username || m.display_name);
      if (playerIds.length === 0) playerIds = ["__none__"];
    }

    // ── Build the ledger rows ───────────────────────────────────────────
    const fx = await loadUsdConverter(admin, async () => getExchangeRate("MWK", "USD"));

    // The ledger type determines which deposits methods apply. Withdrawal
    // and withdrawal_fee types come from the withdrawals table.
    let methods: string[] | null = null;
    if (type !== "all" && type !== "withdrawal" && type !== "withdrawal_fee") {
      methods = Object.entries(METHOD_LEDGER_TYPE)
        .filter(([, t]) => t === type)
        .map(([m]) => m);
    }

    const statusMap = (raw: string) => raw; // raw statuses preserved for detail; UI normalizes

    const depositsSelect = `id, user_id, amount, amount_local, currency, country, method, status, created_at, reference, pawapay_ref, paychangu_ref, charge_id, payment_provider,
      profiles!deposits_user_id_profiles_fkey(username, display_name)`;

    // Filters applicable to both tables.
    const applyCommon = (q: any, tsCol: string) => {
      if (from) q = q.gte(tsCol, new Date(`${from}T00:00:00`).toISOString());
      if (to) q = q.lte(tsCol, new Date(`${to}T23:59:59`).toISOString());
      return q;
    };

    const rows: LedgerRow[] = [];
    const userIds = new Set<string>();

    const wantDeposits = type === "all" || (type !== "withdrawal" && type !== "withdrawal_fee");
    if (wantDeposits) {
      let q = admin.from("deposits").select(depositsSelect) as any;
      if (methods) q = q.in("method", methods);
      if (status !== "all") q = q.in("status", internalStatusFor(status));
      if (country !== "all") q = q.eq("country", country);
      if (playerIds) q = q.in("user_id", playerIds);
      if (min != null) q = q.gte("amount_local", min);
      if (max != null) q = q.lte("amount_local", max);
      q = applyCommon(q, "created_at");
      q = q.order("created_at", { ascending: false }).limit(format === "csv" ? 10000 : limit * 3);
      const { data: deposits } = await q;
      for (const d of deposits || []) {
        const lt = ledgerTypeForMethod(d.method);
        if (type !== "all" && lt !== type) continue; // method list may over-match
        const paidAmount = Math.abs(Number(d.amount || 0));
        const p = (d as any).profiles;
        rows.push({
          id: d.id,
          type: lt,
          method: d.method,
          provider: d.payment_provider || null,
          providerRef: d.pawapay_ref || d.paychangu_ref || d.charge_id || null,
          playerId: d.user_id,
          playerName: p?.username || p?.display_name || playerNames.get(d.user_id) || null,
          country: normalizeCountry(d.country),
          localAmount: d.amount_local != null ? Math.abs(Number(d.amount_local)) : null,
          localCurrency: d.currency || null,
          amountUsd: fx.usdFromMwk(paidAmount),
          amountMwk: Number(d.amount || 0),
          status: statusMap(d.status),
          time: d.created_at,
          reference: d.reference || null,
        });
        if (d.user_id) userIds.add(d.user_id);
      }
    }

    if (type === "all" || type === "withdrawal" || type === "withdrawal_fee") {
      let q = admin.from("withdrawals")
        .select(`id, user_id, amount, amount_local, fee, currency, country, status, created_at, processed_at, pawapay_ref, payment_provider, operator_name,
          profiles!withdrawals_user_id_profiles_fkey(username, display_name)`) as any;
      if (status !== "all") q = q.in("status", internalStatusesForWithdrawal(status));
      if (country !== "all") q = q.eq("country", country);
      if (playerIds) q = q.in("user_id", playerIds);
      if (min != null) q = q.gte("amount_local", min);
      if (max != null) q = q.lte("amount_local", max);
      q = applyCommon(q, "created_at");
      q = q.order("created_at", { ascending: false }).limit(format === "csv" ? 10000 : limit * 3);
      const { data: withdrawals } = await q;
      for (const w of withdrawals || []) {
        const p = (w as any).profiles;
        if (type === "all" || type === "withdrawal") {
          rows.push({
            id: w.id,
            type: "withdrawal",
            method: "withdrawal",
            provider: w.payment_provider || "pawapay",
            providerRef: w.pawapay_ref || null,
            playerId: w.user_id,
            playerName: p?.username || p?.display_name || null,
            country: normalizeCountry(w.country),
            localAmount: w.amount_local != null ? Number(w.amount_local) : null,
            localCurrency: w.currency || null,
            amountUsd: fx.toUsd(Number(w.amount || 0), w.currency || "MWK"),
            amountMwk: Number(w.amount || 0),
            status: w.status,
            time: w.created_at,
            reference: w.operator_name || null,
          });
          if (w.user_id) userIds.add(w.user_id);
        }
        if (type === "all" || type === "withdrawal_fee") {
          const fee = Math.max(0, Number(w.fee || 0));
          if (fee > 0) {
            rows.push({
              id: `${w.id}:fee`,
              type: "withdrawal_fee",
              method: "withdrawal_fee",
              provider: w.payment_provider || "pawapay",
              providerRef: w.pawapay_ref || null,
              playerId: w.user_id,
              playerName: p?.username || p?.display_name || null,
              country: normalizeCountry(w.country),
              localAmount: fee,
              localCurrency: w.currency || null,
              amountUsd: fx.toUsd(fee, w.currency || "MWK"),
              amountMwk: fee,
              status: w.status,
              time: w.processed_at || w.created_at,
              reference: null,
            });
          }
        }
      }
    }

    // ── Sort, paginate ─────────────────────────────────────────────────
    rows.sort((a, b) => {
      const dir = order === "asc" ? 1 : -1;
      if (sort === "amount") {
        const av = a.amountUsd ?? a.localAmount ?? 0;
        const bv = b.amountUsd ?? b.localAmount ?? 0;
        return (av - bv) * dir;
      }
      return (Date.parse(a.time) - Date.parse(b.time)) * dir;
    });

    // ── CSV export ─────────────────────────────────────────────────────
    if (format === "csv") {
      const header = [
        "crazychess_id", "type", "method", "status", "player_id", "player",
        "country", "original_amount", "currency", "usd_equivalent", "amount_mwk",
        "provider", "provider_ref", "reference", "created_at",
      ];
      const lines = [header.join(",")];
      for (const r of rows.slice(0, 10000)) {
        lines.push([
          r.id, LEDGER_TYPE_LABELS[r.type], r.method, r.status, r.playerId,
          r.playerName, r.country, r.localAmount ?? "", r.localCurrency ?? "",
          r.amountUsd != null ? roundUsd(r.amountUsd) : "", r.amountMwk,
          r.provider, r.providerRef, r.reference, r.time,
        ].map(csvEscape).join(","));
      }
      return csvResponse("ccb-ledger", lines) as unknown as NextResponse;
    }

    const total = rows.length;
    const pageRows = rows.slice(page * limit, page * limit + limit);
    return NextResponse.json({
      rows: pageRows,
      page,
      limit,
      total,
      hasMore: (page + 1) * limit < total,
      types: [{ id: "all", label: "All" }, ...LEDGER_TYPES.map((t) => ({ id: t, label: LEDGER_TYPE_LABELS[t] }))],
    });
  } catch (e: any) {
    console.error("Phase 2 ledger error:", e);
    return NextResponse.json({ error: "Failed to fetch ledger" }, { status: 500 });
  }
}

/** Map a Phase 2 normalized status back to internal deposit statuses. */
function internalStatusFor(normalized: string): string[] {
  switch (normalized) {
    case "completed": return ["success"];
    case "pending": return ["pending", "processing"];
    case "failed": return ["failed"];
    case "cancelled": return ["cancelled"];
    default: return ["success"];
  }
}

function internalStatusesForWithdrawal(normalized: string): string[] {
  switch (normalized) {
    case "completed": return ["completed"];
    case "pending": return ["pending", "approved"];
    case "failed": return ["failed", "rejected"];
    case "cancelled": return ["cancelled"];
    default: return ["completed"];
  }
}


