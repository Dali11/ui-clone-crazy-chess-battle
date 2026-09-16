import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getExchangeRate } from "@/lib/geo/fx";
import { loadUsdConverter, roundUsd } from "@/lib/finance/usd";
import { csvEscape, csvResponse } from "@/lib/finance/phase2";
import { COUNTRY_CURRENCY } from "@/lib/geo/currency-map";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/commandcentre/reports?report=<type>&from&to&country&type&stream
 *
 * Downloadable financial reports, consolidated in USD:
 *   deposits      — every successful external deposit
 *   withdrawals   — every completed withdrawal + fees
 *   revenue       — platform revenue by stream (battles rake, memberships,
 *                   ads, tournament entries, withdrawal fees)
 *   fees          — withdrawal fees collected
 *   volume        — transaction volume per day (counts + USD)
 *   balances      — current player balances by country
 *   countries     — country performance summary
 *   reconciliation— the current exception queue with provider amounts
 *
 * Filters: from/to (date window), country, type (for volume), stream
 * (for revenue). READ-ONLY. Admin-only (401/403).
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
    const report = url.searchParams.get("report") || "deposits";
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const country = url.searchParams.get("country");
    const stream = url.searchParams.get("stream") || "all";
    const since = from ? new Date(`${from}T00:00:00`).toISOString() : null;
    const until = to ? new Date(`${to}T23:59:59`).toISOString() : null;

    const fx = await loadUsdConverter(admin, async () => getExchangeRate("MWK", "USD"));
    const MONEY_IN = ["mobile_money", "card", "bank_transfer", "pawapay", "paychangu"];

    const win = (col: string) => (q: any) => {
      if (since) q = q.gte(col, since);
      if (until) q = q.lte(col, until);
      return q;
    };
    const lines: string[] = [];

    switch (report) {
      case "deposits": {
        let q = admin.from("deposits")
          .select(`id, created_at, amount, amount_local, currency, country, method, status, pawapay_ref, paychangu_ref,
            profiles!deposits_user_id_profiles_fkey(username, display_name)`) as any;
        q = q.in("method", MONEY_IN).eq("status", "success");
        if (country) q = q.eq("country", country);
        q = win("created_at")(q);
        const { data: rows } = await q.order("created_at", { ascending: false }).limit(10000);
        lines.push(["created_at", "player", "country", "method", "amount_local", "currency", "usd_equivalent", "provider_ref"].join(","));
        for (const r of rows || []) {
          const p = (r as any).profiles;
          lines.push([r.created_at, p?.username || p?.display_name || "", r.country, r.method,
            r.amount_local ?? "", r.currency ?? "", roundUsd(fx.usdFromMwk(Math.abs(Number(r.amount || 0))) ?? 0),
            r.pawapay_ref || r.paychangu_ref || ""].map(csvEscape).join(","));
        }
        break;
      }
      case "withdrawals": {
        let q = admin.from("withdrawals")
          .select(`id, created_at, amount, amount_local, fee, currency, country, status, pawapay_ref,
            profiles!withdrawals_user_id_profiles_fkey(username, display_name)`) as any;
        q = q.eq("status", "completed");
        if (country) q = q.eq("country", country);
        q = win("created_at")(q);
        const { data: rows } = await q.order("created_at", { ascending: false }).limit(10000);
        lines.push(["created_at", "player", "country", "amount_local", "currency", "usd_equivalent", "fee", "fee_usd", "payout_ref"].join(","));
        for (const r of rows || []) {
          const p = (r as any).profiles;
          lines.push([r.created_at, p?.username || p?.display_name || "", r.country,
            r.amount_local ?? "", r.currency ?? "",
            roundUsd(fx.toUsd(Number(r.amount || 0), r.currency || "MWK") ?? 0),
            r.fee ?? "", roundUsd(fx.toUsd(Math.max(0, Number(r.fee || 0)), r.currency || "MWK") ?? 0),
            r.pawapay_ref || ""].map(csvEscape).join(","));
        }
        break;
      }
      case "fees": {
        let q = admin.from("withdrawals").select("id, created_at, processed_at, amount, fee, currency, country, status") as any;
        q = q.eq("status", "completed").gt("fee", 0);
        if (country) q = q.eq("country", country);
        q = win("created_at")(q);
        const { data: rows } = await q.order("created_at", { ascending: false }).limit(10000);
        lines.push(["processed_at", "country", "fee", "currency", "fee_usd", "withdrawal_id"].join(","));
        for (const r of rows || []) {
          lines.push([r.processed_at || r.created_at, r.country, r.fee, r.currency || "",
            roundUsd(fx.toUsd(Number(r.fee || 0), r.currency || "MWK") ?? 0), r.id].map(csvEscape).join(","));
        }
        break;
      }
      case "revenue": {
        const methods = ["membership_purchase", "ad_purchase", "tournament_entry"];
        const { data: revRows } = await admin
          .from("deposits")
          .select("id, created_at, amount, currency, country, method, status, user_id")
          .in("method", methods)
          .eq("status", "success")
          .gte("created_at", since || new Date(0).toISOString())
          .lte("created_at", until || new Date().toISOString())
          .limit(10000);
        const { data: feeRows } = await admin
          .from("withdrawals")
          .select("id, created_at, fee, currency, country, status, user_id")
          .eq("status", "completed").gt("fee", 0)
          .gte("created_at", since || new Date(0).toISOString())
          .lte("created_at", until || new Date().toISOString())
          .limit(10000);
        const { data: battles } = await admin
          .from("battles")
          .select("id, completed_at, pot, stake, winner_payout, white_player_id")
          .eq("settled", true).eq("status", "completed").not("winner_id", "is", null)
          .gte("completed_at", since || new Date(0).toISOString())
          .lte("completed_at", until || new Date().toISOString())
          .limit(10000);

        type RevRow = { date: string; stream: string; country: string | null; usd: number };
        const out: RevRow[] = [];
        for (const r of revRows || []) {
          const s = r.method === "membership_purchase" ? "memberships" : r.method === "ad_purchase" ? "ads" : "tournaments";
          if (stream !== "all" && stream !== s) continue;
          if (country && r.country !== country) continue;
          out.push({ date: r.created_at, stream: s, country: r.country, usd: fx.usdFromMwk(Math.abs(Number(r.amount || 0))) ?? 0 });
        }
        for (const r of feeRows || []) {
          if (stream !== "all" && stream !== "withdrawal_fees") continue;
          if (country && r.country !== country) continue;
          out.push({ date: r.created_at, stream: "withdrawal_fees", country: r.country, usd: fx.toUsd(Number(r.fee || 0), r.currency || "MWK") ?? 0 });
        }
        for (const b of battles || []) {
          if (stream !== "all" && stream !== "battles") continue;
          const rake = Math.max(0, Number(b.pot ?? (b.stake ?? 0) * 2) - Number(b.winner_payout ?? 0));
          if (rake <= 0) continue;
          const { data: bp } = await admin.from("profiles").select("country").eq("id", b.white_player_id).single();
          const c = bp?.country || null;
          if (country && c !== country) continue;
          out.push({ date: b.completed_at, stream: "battles", country: c, usd: fx.toUsd(rake, COUNTRY_CURRENCY[(c || "").toUpperCase()] || "MWK") ?? 0 });
        }
        lines.push(["date", "stream", "country", "usd"].join(","));
        for (const r of out.sort((a, b) => Date.parse(b.date) - Date.parse(a.date))) {
          lines.push([r.date, r.stream, r.country || "", roundUsd(r.usd)].map(csvEscape).join(","));
        }
        break;
      }
      case "volume": {
        let q = admin.from("deposits").select("id, created_at, amount, amount_local, currency, country, method, status") as any;
        q = win("created_at")(q);
        const { data: rows } = q.limit(20000);
        const byDay = new Map<string, { count: number; usd: number }>();
        for (const r of rows || []) {
          if (r.status !== "success") continue;
          if (country && r.country !== country) continue;
          const key = String(r.created_at).slice(0, 10);
          const e = byDay.get(key) || { count: 0, usd: 0 };
          e.count += 1;
          e.usd += fx.usdFromMwk(Math.abs(Number(r.amount || 0))) ?? 0;
          byDay.set(key, e);
        }
        lines.push(["date", "transaction_count", "usd_volume"].join(","));
        for (const [k, v] of [...byDay.entries()].sort((a, b) => a[0] < b[0] ? 1 : -1)) {
          lines.push([k, v.count, roundUsd(v.usd)].join(","));
        }
        break;
      }
      case "balances": {
        const { data: rows } = await admin
          .from("profiles")
          .select("id, username, display_name, country, wallet_balance")
          .limit(20000);
        lines.push(["player_id", "username", "country", "wallet_balance", "wallet_currency", "usd_equivalent"].join(","));
        for (const r of rows || []) {
          const cur = COUNTRY_CURRENCY[(r.country || "").toUpperCase()] || "MWK";
          if (country && r.country !== country) continue;
          lines.push([r.id, r.username, r.country, r.wallet_balance, cur,
            roundUsd(fx.toUsd(Number(r.wallet_balance || 0), cur) ?? 0)].map(csvEscape).join(","));
        }
        break;
      }
      case "countries": {
        const { data: rows } = await admin
          .from("deposits")
          .select("id, amount, amount_local, currency, country, method, status, user_id")
          .in("method", [...MONEY_IN, "membership_purchase", "ad_purchase", "tournament_entry"])
          .gte("created_at", since || new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString())
          .limit(20000);
        const { data: wrows } = await admin
          .from("withdrawals")
          .select("id, amount, fee, currency, country, status, user_id")
          .gte("created_at", since || new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString())
          .limit(20000);
        const agg = new Map<string, { deposits: number; withdrawals: number; revenue: number; fees: number; count: number }>();
        for (const r of rows || []) {
          if (r.status !== "success") continue;
          const c = r.country || "ZZ";
          const a = agg.get(c) || { deposits: 0, withdrawals: 0, revenue: 0, fees: 0, count: 0 };
          const usd = fx.usdFromMwk(Math.abs(Number(r.amount || 0))) ?? 0;
          a.count += 1;
          if (MONEY_IN.includes(r.method)) a.deposits += usd;
          else a.revenue += usd;
          agg.set(c, a);
        }
        for (const r of wrows || []) {
          const c = r.country || "ZZ";
          const a = agg.get(c) || { deposits: 0, withdrawals: 0, revenue: 0, fees: 0, count: 0 };
          if (r.status === "completed") {
            const usd = fx.toUsd(Number(r.amount || 0), r.currency || "MWK") ?? 0;
            a.withdrawals += usd;
            a.fees += fx.toUsd(Math.max(0, Number(r.fee || 0)), r.currency || "MWK") ?? 0;
            a.count += 1;
          }
          agg.set(c, a);
        }
        lines.push(["country", "deposits_usd", "withdrawals_usd", "revenue_usd", "withdrawal_fees_usd", "transaction_count"].join(","));
        for (const [c, a] of [...agg.entries()].sort((x, y) => y[1].deposits - x[1].deposits)) {
          lines.push([c, roundUsd(a.deposits), roundUsd(a.withdrawals), roundUsd(a.revenue), roundUsd(a.fees), a.count].join(","));
        }
        break;
      }
      case "reconciliation": {
        const { data: rows } = await admin
          .from("reconciliation_exceptions")
          .select("*, resolved_by_profile:profiles!reconciliation_exceptions_resolved_by_fkey(username)")
          .order("detected_at", { ascending: false })
          .limit(5000);
        lines.push(["detected_at", "kind", "severity", "entity_type", "entity_id", "provider_ref", "country", "currency",
          "provider_amount", "internal_amount", "difference", "provider_status", "internal_status",
          "resolved", "resolved_by", "resolution_action", "resolution_note"].join(","));
        for (const r of rows || []) {
          lines.push([r.detected_at, r.kind, r.severity, r.entity_type, r.entity_id || "", r.provider_ref || "",
            r.country || "", r.currency || "", r.provider_amount ?? "", r.internal_amount ?? "",
            r.difference ?? "", r.provider_status || "", r.internal_status || "",
            r.resolved, (r as any).resolved_by_profile?.username || "", r.resolution_action || "",
            r.resolution_note || ""].map(csvEscape).join(","));
        }
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown report type" }, { status: 400 });
    }

    return csvResponse(`ccb-${report}`, lines) as unknown as NextResponse;
  } catch (e: any) {
    console.error("Phase 2 reports error:", e);
    return NextResponse.json({ error: "Failed to generate report" }, { status: 500 });
  }
}
