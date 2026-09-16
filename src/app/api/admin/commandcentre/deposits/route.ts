import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExchangeRate } from "@/lib/geo/fx";
import { loadUsdConverter, roundUsd } from "@/lib/finance/usd";
import { fetchAll, normalizeCountry } from "@/lib/finance/commandcentre";
import { csvEscape, csvResponse } from "@/lib/finance/phase2";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/commandcentre/deposits — Phase 2 deposit management.
 *
 * Without ?id: KPI tiles + filterable deposit rows.
 *   KPIs: total deposits (USD), deposit volume (count), successful,
 *   pending, failed, success rate — over the filtered window.
 *   Filters: country, from/to, status, network (payment_provider/operator),
 *   min/max amount, player search.
 *
 * With ?id: full detail for one deposit — the row itself, the player,
 *   every provider callback received for its reference (payment history),
 *   and the player's related recent ledger rows.
 *
 * ?format=csv exports the filtered set. READ-ONLY.
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

    // ── Single-deposit detail ───────────────────────────────────────────
    if (id) {
      const { data: deposit, error } = await admin
        .from("deposits")
        .select(`id, user_id, amount, amount_local, currency, country, method, status, created_at, updated_at,
                 reference, pawapay_ref, paychangu_ref, charge_id, payment_provider, operator, phone,
                 admin_notes, credited_by, fx_rate,
                 profiles!deposits_user_id_profiles_fkey(id, username, display_name, country, wallet_balance)`)
        .eq("id", id)
        .single();
      if (error || !deposit) return NextResponse.json({ error: "Deposit not found" }, { status: 404 });

      const providerRefs = [deposit.pawapay_ref, deposit.paychangu_ref, deposit.charge_id].filter(Boolean) as string[];
      let providerHistory: any[] = [];
      if (providerRefs.length > 0) {
        const { data: events } = await admin
          .from("provider_transactions")
          .select("provider, provider_ref, direction, provider_status, amount_local, currency, country, received_at, raw_payload")
          .in("provider_ref", providerRefs)
          .order("received_at", { ascending: true })
          .limit(50);
        providerHistory = events || [];
      }

      const { data: related } = await admin
        .from("deposits")
        .select("id, amount, currency, method, status, created_at, reference")
        .eq("user_id", deposit.user_id)
        .order("created_at", { ascending: false })
        .limit(20);

      return NextResponse.json({
        deposit,
        providerHistory,
        related: related || [],
        amountUsd: fx.usdFromMwk(Math.abs(Number(deposit.amount || 0))),
      });
    }

    // ── List + KPIs ─────────────────────────────────────────────────────
    const status = url.searchParams.get("status") || "all";
    const country = url.searchParams.get("country") || "all";
    const network = url.searchParams.get("network") || "all";
    const player = (url.searchParams.get("player") || "").trim();
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const min = Number(url.searchParams.get("min")) || null;
    const max = Number(url.searchParams.get("max")) || null;
    const page = Math.max(Number(url.searchParams.get("page")) || 0, 0);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
    const format = url.searchParams.get("format");

    const MONEY_IN = ["mobile_money", "card", "bank_transfer", "pawapay", "paychangu"];

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

    const select = `id, user_id, amount, amount_local, currency, country, method, status, created_at, reference,
                    pawapay_ref, paychangu_ref, payment_provider, operator, phone, admin_notes,
                    profiles!deposits_user_id_profiles_fkey(username, display_name)`;

    const build = () => {
      let q = admin.from("deposits").select(select, { count: "exact" }) as any;
      q = q.in("method", MONEY_IN);
      if (status === "completed") q = q.eq("status", "success");
      else if (status === "pending") q = q.in("status", ["pending", "processing"]);
      else if (status === "failed") q = q.eq("status", "failed");
      else if (status === "cancelled") q = q.eq("status", "cancelled");
      if (country !== "all") q = q.eq("country", country);
      if (network !== "all") q = q.eq("payment_provider", network);
      if (playerIds) q = q.in("user_id", playerIds);
      if (min != null) q = q.gte("amount_local", min);
      if (max != null) q = q.lte("amount_local", max);
      if (from) q = q.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
      if (to) q = q.lte("created_at", new Date(`${to}T23:59:59`).toISOString());
      return q;
    };

    if (format === "csv") {
      const { data: rows } = await build().order("created_at", { ascending: false }).limit(10000);
      const header = ["id", "created_at", "player", "country", "network", "operator", "phone",
        "amount_local", "currency", "usd_equivalent", "status", "provider_ref", "reference", "admin_notes"];
      const lines = [header.join(",")];
      for (const r of rows || []) {
        const p = (r as any).profiles;
        lines.push([
          r.id, r.created_at, p?.username || p?.display_name || "", r.country,
          r.payment_provider, r.operator, r.phone,
          r.amount_local ?? "", r.currency ?? "",
          roundUsd(fx.usdFromMwk(Math.abs(Number(r.amount || 0))) ?? 0), r.status,
          r.pawapay_ref || r.paychangu_ref || "", r.reference || "", r.admin_notes || "",
        ].map(csvEscape).join(","));
      }
      return csvResponse("ccb-deposits", lines) as unknown as NextResponse;
    }

    const { data: rows, count } = await build()
      .order("created_at", { ascending: false })
      .range(page * limit, page * limit + limit - 1);

    // KPIs over the same filter window (fetch statuses + amounts only).
    const kpiRows = await fetchAll((pg) => {
      let q = admin.from("deposits").select("amount, status, country") as any;
      q = q.in("method", MONEY_IN);
      if (country !== "all") q = q.eq("country", country);
      if (network !== "all") q = q.eq("payment_provider", network);
      if (playerIds) q = q.in("user_id", playerIds);
      if (min != null) q = q.gte("amount_local", min);
      if (max != null) q = q.lte("amount_local", max);
      if (from) q = q.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
      if (to) q = q.lte("created_at", new Date(`${to}T23:59:59`).toISOString());
      return q.range(pg * 1000, pg * 1000 + 999);
    }, 1000, 20000);

    let totalUsd = 0, successful = 0, pending = 0, failed = 0, volumeCount = 0;
    const byCountry = new Map<string, number>();
    for (const r of kpiRows) {
      volumeCount += 1;
      const s = r.status;
      if (s === "success") {
        successful += 1;
        totalUsd += fx.usdFromMwk(Math.abs(Number(r.amount || 0))) ?? 0;
        const c = normalizeCountry(r.country);
        if (c) byCountry.set(c, (byCountry.get(c) || 0) + 1);
      } else if (s === "pending" || s === "processing") pending += 1;
      else if (s === "failed") failed += 1;
    }

    return NextResponse.json({
      rows: (rows || []).map((r: any) => ({
        ...r,
        amountUsd: fx.usdFromMwk(Math.abs(Number(r.amount || 0))),
      })),
      page,
      limit,
      total: count ?? kpiRows.length,
      hasMore: (rows?.length || 0) === limit,
      kpis: {
        totalUsd: roundUsd(totalUsd),
        volumeCount,
        successful,
        pending,
        failed,
        successRate: volumeCount > 0 ? Math.round((successful / volumeCount) * 1000) / 10 : 0,
      },
    });
  } catch (e: any) {
    console.error("Phase 2 deposits error:", e);
    return NextResponse.json({ error: "Failed to fetch deposits" }, { status: 500 });
  }
}
