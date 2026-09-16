import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/ledger — unified money-movement ledger over `deposits`.
 *
 * The deposits table is the platform's single source of truth for wallet
 * activity: payment inflows (mobile_money, card, bank_transfer, pawapay),
 * battle escrow/payouts/refunds, tournament entries/payouts, membership
 * purchases, ad purchases, affiliate commissions, failure refunds and
 * the weekly revenue sweep. This endpoint surfaces ALL of it with
 * category filters, full-text-ish search, date ranges, pagination,
 * per-category summary tiles, and CSV export.
 *
 * Admin-only (401/403) — same auth pattern as the other admin routes.
 */

// Category map: method → human group. Anything unmapped lands in "other".
const METHOD_CATEGORIES: Record<string, string> = {
  // Money into the platform from the outside world
  mobile_money: "money_in",
  card: "money_in",
  bank_transfer: "money_in",
  pawapay: "money_in",
  // Battle lifecycle
  battle_escrow: "battle",
  battle_challenge_escrow: "battle",
  battle_payout: "battle",
  battle_refund: "battle",
  battle_challenge_cancel: "battle",
  battle_cancel: "battle",
  battle_queue_refund: "battle",
  battle_queue_timeout: "battle",
  heal_stuck: "battle",
  expired_challenge: "battle",
  cleanup_expired: "battle",
  platform_cut: "battle",
  // Tournament lifecycle
  tournament_entry: "tournament",
  tournament_payout: "tournament",
  tournament_refund: "tournament",
  tournament_creator_profit: "tournament",
  tournament_payout_reversal: "tournament",
  // Platform revenue streams
  membership_purchase: "membership",
  ad_purchase: "ads",
  affiliate_commission: "affiliate",
  // Corrections & sweeps
  clawback_duplicate_refund: "corrections",
  duplicate_payout_removal: "corrections",
  withdrawal_failed_refund: "corrections",
  platform_revenue_sweep: "sweep",
};

const CATEGORY_LABELS: Record<string, string> = {
  money_in: "Money In",
  battle: "Battles",
  tournament: "Tournaments",
  membership: "Membership",
  ads: "Ads",
  affiliate: "Affiliate",
  corrections: "Corrections",
  sweep: "Revenue Sweep",
  other: "Other",
};

const CATEGORY_METHODS = (category: string): string[] =>
  category === "all"
    ? []
    : Object.entries(METHOD_CATEGORIES)
        .filter(([, c]) => c === category)
        .map(([m]) => m);

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const url = new URL(req.url);
    const category = url.searchParams.get("category") || "all";
    const status = url.searchParams.get("status") || "all";
    const search = (url.searchParams.get("search") || "").trim();
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const format = url.searchParams.get("format"); // "csv"
    const limit = Math.min(Number(url.searchParams.get("limit")) || 100, 5000);
    const page = Math.max(Number(url.searchParams.get("page")) || 0, 0);

    // ── Build the shared filter ────────────────────────────────────────
    let userFilterIds: string[] | null = null;
    if (search) {
      // Resolve usernames first — PostgREST can't search across FK joins.
      const { data: matches } = await admin
        .from("profiles")
        .select("id")
        .or(`username.ilike.%${search}%,display_name.ilike.%${search}%`)
        .limit(50);
      userFilterIds = (matches || []).map((m: any) => m.id);
    }

    const buildQuery = (select: string) => {
      let q = admin.from("deposits").select(select) as any;
      if (category === "other") {
        // Unmapped methods bucket — everything not in the category map.
        const allMethods = Object.keys(METHOD_CATEGORIES).join(",");
        q = q.not("method", "in", `(${allMethods})`);
      } else {
        const methods = CATEGORY_METHODS(category);
        if (methods.length > 0) q = q.in("method", methods);
      }
      if (status !== "all") q = q.eq("status", status);
      if (from) q = q.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
      if (to) q = q.lte("created_at", new Date(`${to}T23:59:59`).toISOString());
      if (search) {
        // Search reference/phone/notes OR any resolved username matches.
        // If the username lookup found nothing, only text fields are used.
        const textMatch = `reference.ilike.%${search}%,phone.ilike.%${search}%,admin_notes.ilike.%${search}%`;
        q = userFilterIds && userFilterIds.length > 0
          ? q.or(`${textMatch},user_id.in.(${userFilterIds.join(",")})`)
          : q.or(textMatch);
      }
      return q;
    };

    // ── Rows ───────────────────────────────────────────────────────────
    const rowsSelect = `
      id, user_id, amount, amount_local, currency, status, method,
      reference, phone, operator, payment_provider, pawapay_ref,
      charge_id, admin_notes, created_at,
      profiles!deposits_user_id_profiles_fkey(username, display_name)
    `;

    if (format === "csv") {
      const { data: rows, error } = await buildQuery(rowsSelect)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const esc = (v: any) => {
        const s = v == null ? "" : String(v);
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const header = [
        "created_at", "username", "display_name", "category", "method",
        "status", "amount_mwk", "amount_local", "currency", "reference",
        "payment_provider", "phone", "operator", "admin_notes",
      ];
      const lines = [header.join(",")];
      for (const r of rows || []) {
        const p = (r as any).profiles;
        lines.push([
          (r as any).created_at,
          p?.username ?? "",
          p?.display_name ?? "",
          CATEGORY_LABELS[METHOD_CATEGORIES[(r as any).method] || "other"] || "Other",
          (r as any).method,
          (r as any).status,
          (r as any).amount ?? 0,
          (r as any).amount_local ?? "",
          (r as any).currency ?? "",
          (r as any).reference ?? "",
          (r as any).payment_provider ?? "",
          (r as any).phone ?? "",
          (r as any).operator ?? "",
          (r as any).admin_notes ?? "",
        ].map(esc).join(","));
      }
      return new NextResponse(lines.join("\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="ccb-ledger-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const { data: rows, error, count } = await buildQuery(rowsSelect)
      .order("created_at", { ascending: false })
      .range(page * limit, page * limit + limit - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // ── Summary tiles (category + status + date window, ignores search) ─
    const summarySelect = "method, amount, status";
    const { data: summaryRows } = await (async () => {
      let q = admin.from("deposits").select(summarySelect) as any;
      const methods = CATEGORY_METHODS(category);
      if (methods.length > 0 && category !== "other") q = q.in("method", methods);
      else if (category === "other") q = q.not("method", "in", `(${Object.keys(METHOD_CATEGORIES).join(",")})`);
      if (status !== "all") q = q.eq("status", status);
      if (from) q = q.gte("created_at", new Date(`${from}T00:00:00`).toISOString());
      if (to) q = q.lte("created_at", new Date(`${to}T23:59:59`).toISOString());
      return q.limit(20000);
    })();

    const summary: Record<string, { count: number; net: number }> = {};
    for (const r of summaryRows || []) {
      const cat = METHOD_CATEGORIES[(r as any).method] || "other";
      const label = CATEGORY_LABELS[cat] || "Other";
      summary[label] = summary[label] || { count: 0, net: 0 };
      summary[label].count += 1;
      summary[label].net += Number((r as any).amount) || 0;
    }

    // ── Category list for the filter dropdown ──────────────────────────
    const categories = [
      { id: "all", label: "All" },
      ...Object.keys(CATEGORY_LABELS).map((c) => ({ id: c, label: CATEGORY_LABELS[c] })),
    ];

    return NextResponse.json({
      rows,
      page,
      limit,
      total: count,
      hasMore: (rows?.length || 0) === limit,
      summary,
      categories,
    });
  } catch (e: any) {
    console.error("Admin ledger error:", e);
    return NextResponse.json({ error: "Failed to fetch ledger" }, { status: 500 });
  }
}
