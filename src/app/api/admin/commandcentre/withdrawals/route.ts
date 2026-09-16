import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExchangeRate } from "@/lib/geo/fx";
import { loadUsdConverter, roundUsd } from "@/lib/finance/usd";
import { fetchAll, normalizeCountry } from "@/lib/finance/commandcentre";
import { csvEscape, csvResponse } from "@/lib/finance/phase2";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/commandcentre/withdrawals — Phase 2 withdrawal management.
 *
 * Without ?id: KPI tiles + filterable withdrawal rows + the pending queue.
 *   KPIs: total withdrawal volume (USD), completed, pending, failed,
 *   withdrawal fees collected.
 *   Filters: country, player, status, from/to, min/max amount.
 *
 * With ?id: full detail for one withdrawal — the row, the player, the
 *   provider callback history for its payout reference, and the fee/net
 *   breakdown.
 *
 * ?format=csv exports the filtered set. READ-ONLY — approvals still live
 * in the legacy /admin panel (no duplicated controls).
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

    // ── Single-withdrawal detail ─────────────────────────────────────────
    if (id) {
      const { data: w, error } = await admin
        .from("withdrawals")
        .select(`id, user_id, amount, amount_local, fee, net_amount, currency, country, status, created_at,
                 updated_at, processed_at, processed_by, pawapay_ref, payment_provider, operator_name, phone,
                 admin_notes, rejection_reason, bank_code, account_number, recipient_name,
                 profiles!withdrawals_user_id_profiles_fkey(id, username, display_name, country, wallet_balance)`)
        .eq("id", id)
        .single();
      if (error || !w) return NextResponse.json({ error: "Withdrawal not found" }, { status: 404 });

      let providerHistory: any[] = [];
      if (w.pawapay_ref) {
        const { data: events } = await admin
          .from("provider_transactions")
          .select("provider, provider_ref, direction, provider_status, amount_local, currency, country, received_at, raw_payload")
          .eq("provider_ref", w.pawapay_ref)
          .order("received_at", { ascending: true })
          .limit(50);
        providerHistory = events || [];
      }

      let processor: any = null;
      if (w.processed_by) {
        const { data: proc } = await admin
          .from("profiles").select("username, display_name").eq("id", w.processed_by).single();
        processor = proc;
      }

      return NextResponse.json({
        withdrawal: w,
        providerHistory,
        processor,
        amountUsd: fx.toUsd(Number(w.amount || 0), w.currency || "MWK"),
        feeUsd: fx.toUsd(Math.max(0, Number(w.fee || 0)), w.currency || "MWK"),
      });
    }

    // ── List + KPIs ─────────────────────────────────────────────────────
    const status = url.searchParams.get("status") || "all";
    const country = url.searchParams.get("country") || "all";
    const player = (url.searchParams.get("player") || "").trim();
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const min = Number(url.searchParams.get("min")) || null;
    const max = Number(url.searchParams.get("max")) || null;
    const page = Math.max(Number(url.searchParams.get("page")) || 0, 0);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
    const format = url.searchParams.get("format");

    let playerIds: string[] | null = null;
    if (player) {
      const isUuid = /^[0-9a-f-]{36}$/i.test(player);
      const { data: matches } = await admin
        .from("profiles")
        .select("id")
        .or(`username.ilike.%${player}%,display_name.ilike.%${player}%,id.eq.${isUuid ? player : "00000000-0000-0000-0000-000000000000"}`)
        .limit(100);
      playerIds = (matches || []).map((m: any) => m.id);
      if (playerIds.length === 0) playerIds = ["__none__"];
    }

    const select = `id, user_id, amount, amount_local, fee, net_amount, currency, country, status, created_at,
                    processed_at, pawapay_ref, payment_provider, operator_name, phone, admin_notes, rejection_reason,
                    profiles!withdrawals_user_id_profiles_fkey(username, display_name)`;

    const build = () => {
      let q = admin.from("withdrawals").select(select, { count: "exact" }) as any;
      if (status === "completed") q = q.eq("status", "completed");
      else if (status === "pending") q = q.in("status", ["pending", "approved"]);
      else if (status === "failed") q = q.in("status", ["failed", "rejected"]);
      if (country !== "all") q = q.eq("country", country);
      if (playerIds) q = q.in("user_id", playerIds);
      if (min != null) q = q.gte("amount_local", min);
      if (max != null) q = q.lte("amount_local", max);
      if (from) q = q.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
      if (to) q = q.lte("created_at", new Date(`${to}T23:59:59`).toISOString());
      return q;
    };

    if (format === "csv") {
      const { data: rows } = await build().order("created_at", { ascending: false }).limit(10000);
      const header = ["id", "created_at", "player", "country", "operator", "phone",
        "amount_local", "currency", "usd_equivalent", "fee", "net_amount", "status",
        "payout_ref", "admin_notes", "rejection_reason"];
      const lines = [header.join(",")];
      for (const r of rows || []) {
        const p = (r as any).profiles;
        lines.push([
          r.id, r.created_at, p?.username || p?.display_name || "", r.country,
          r.operator_name, r.phone, r.amount_local ?? "", r.currency ?? "",
          roundUsd(fx.toUsd(Number(r.amount || 0), r.currency || "MWK") ?? 0),
          r.fee ?? "", r.net_amount ?? "", r.status, r.pawapay_ref || "",
          r.admin_notes || "", r.rejection_reason || "",
        ].map(csvEscape).join(","));
      }
      return csvResponse("ccb-withdrawals", lines) as unknown as NextResponse;
    }

    const { data: rows, count } = await build()
      .order("created_at", { ascending: false })
      .range(page * limit, page * limit + limit - 1);

    // KPIs over the same window.
    const kpiRows = await fetchAll((pg) => {
      let q = admin.from("withdrawals").select("amount, amount_local, currency, status, fee, country") as any;
      if (country !== "all") q = q.eq("country", country);
      if (playerIds) q = q.in("user_id", playerIds);
      if (min != null) q = q.gte("amount_local", min);
      if (max != null) q = q.lte("amount_local", max);
      if (from) q = q.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
      if (to) q = q.lte("created_at", new Date(`${to}T23:59:59`).toISOString());
      return q.range(pg * 1000, pg * 1000 + 999);
    }, 1000, 20000);

    let totalUsd = 0, completed = 0, pending = 0, failed = 0, feesUsd = 0;
    for (const r of kpiRows) {
      const s = r.status;
      const usd = fx.toUsd(Number(r.amount || 0), r.currency || "MWK") ?? 0;
      const feeUsd = fx.toUsd(Math.max(0, Number(r.fee || 0)), r.currency || "MWK") ?? 0;
      if (s === "completed") {
        completed += 1;
        totalUsd += usd;
        feesUsd += feeUsd;
      } else if (s === "pending" || s === "approved") pending += 1;
      else if (s === "failed" || s === "rejected") failed += 1;
    }

    // Pending queue — oldest first, capped at 50 for operational review.
    const { data: queue } = await admin
      .from("withdrawals")
      .select(select)
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: true })
      .limit(50);

    return NextResponse.json({
      rows: (rows || []).map((r: any) => ({
        ...r,
        amountUsd: fx.toUsd(Number(r.amount || 0), r.currency || "MWK"),
      })),
      page,
      limit,
      total: count ?? kpiRows.length,
      hasMore: (rows?.length || 0) === limit,
      queue: (queue || []).map((r: any) => ({
        ...r,
        amountUsd: fx.toUsd(Number(r.amount || 0), r.currency || "MWK"),
      })),
      kpis: {
        totalUsd: roundUsd(totalUsd),
        completed,
        pending,
        failed,
        feesUsd: roundUsd(feesUsd),
      },
    });
  } catch (e: any) {
    console.error("Phase 2 withdrawals error:", e);
    return NextResponse.json({ error: "Failed to fetch withdrawals" }, { status: 500 });
  }
}
