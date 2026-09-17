import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll, fetchByIdChunks } from "@/lib/supabase/fetch-all";
import { createClient } from "@/lib/supabase/server";
import { loadUsdConverter, roundUsd, type UsdConverter } from "@/lib/finance/usd";
import { getExchangeRate } from "@/lib/geo/fx";

/**
 * GET /api/admin/battles
 * Robust admin listing + stats for Chess Battles, with time-range,
 * status, country, and search filters.
 *
 * Query params:
 *   range    - "today" | "7d" | "30d" | "3m" | "6m" | "1y" | "all" (default "7d")
 *   status   - "all" | "stuck" | "pending" | "playing" | "completed" |
 *              "disputed" | "cancelled" (default "all")
 *   country  - ISO 3166-1 alpha-2 country code, or "all" (default "all")
 *   search   - username/display_name substring match
 *   page     - 1-indexed page number (default 1)
 *   limit    - page size (default 25, max 100)
 */

// CAT is UTC+2 year-round (no DST) — a fixed offset is exact. Scopes are
// CALENDAR-anchored (today starts at CAT midnight), not rolling windows:
// "today" never spills into yesterday, "7d"/"30d" start at a CAT midnight.
const CAT_OFFSET_MS = 2 * 60 * 60 * 1000;

function rangeStartISO(range: string): string | null {
  if (range === "all") return null;
  const now = new Date();
  const cat = new Date(now.getTime() + CAT_OFFSET_MS);
  const midnight = Date.UTC(cat.getUTCFullYear(), cat.getUTCMonth(), cat.getUTCDate()) - CAT_OFFSET_MS;
  const days = range === "today" || range === "1d" ? 0
    : range === "7d" ? 6
    : range === "30d" ? 29
    : range === "3m" ? 89
    : range === "6m" ? 179
    : 364; // "1y"
  return new Date(midnight - days * 86_400_000).toISOString();
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Admin only" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "7d";
    const statusFilter = searchParams.get("status") || "all";
    const country = searchParams.get("country") || "all";
    const search = (searchParams.get("search") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10) || 25));

    const sinceISO = rangeStartISO(range) ?? rangeStartISO("7d");
    const stuckCutoffISO = new Date(Date.now() - 60_000).toISOString();

    // Admin reporting currency is USD — stake/pot/fee figures ride along
    // converted (the Command Centre Battles view never shows raw MWK).
    const fx = await loadUsdConverter(admin, async () => getExchangeRate("MWK", "USD"));

    // Resolve player-id restriction from country/search filters
    let restrictToPlayerIds: string[] | null = null;
    if (country !== "all" || search) {
      let profileQuery = admin.from("profiles").select("id");
      if (country !== "all") profileQuery = profileQuery.eq("country", country);
      if (search) profileQuery = profileQuery.or(`username.ilike.%${search}%,display_name.ilike.%${search}%`);
      const { data: matchedProfiles } = await profileQuery.limit(5000);
      restrictToPlayerIds = (matchedProfiles ?? []).map((p) => p.id);
      if (restrictToPlayerIds.length === 0) {
        return NextResponse.json({
          battles: [], total: 0, page, limit,
          stats: { total: 0, pending: 0, stuck: 0, playing: 0, completed: 0, disputed: 0, cancelled: 0, totalVolume: 0, totalRevenue: 0, totalVolumeUsd: 0, totalRevenueUsd: 0 },
          availableCountries: [],
        });
      }
    }

    function applyCommonFilters(q: any) {
      if (sinceISO) q = q.gte("created_at", sinceISO);
      if (restrictToPlayerIds) {
        const idList = restrictToPlayerIds.join(",");
        q = q.or(`white_player_id.in.(${idList}),black_player_id.in.(${idList})`);
      }
      return q;
    }

    let listQuery = admin.from("battles").select(
      `id, status, stake, pot, platform_fee, winner_payout, result,
       white_player_id, black_player_id, winner_id, white_rating, black_rating,
       game_id, armageddon_game_id, armageddon_round, settled,
       created_at, started_at, completed_at, time_control, notes`,
      { count: "exact" }
    );
    listQuery = applyCommonFilters(listQuery);
    listQuery = applyStatusFilter(listQuery, statusFilter, stuckCutoffISO);
    listQuery = listQuery.order("created_at", { ascending: false }).range((page - 1) * limit, page * limit - 1);

    const { data: battles, count, error: listErr } = await listQuery;
    if (listErr) return NextResponse.json({ error: "Query failed" }, { status: 500 });

    // Resolve player usernames/countries
    const playerIds = new Set<string>();
    for (const b of battles ?? []) {
      playerIds.add(b.white_player_id);
      playerIds.add(b.black_player_id);
      if (b.winner_id) playerIds.add(b.winner_id);
    }
    const { data: players } = await admin.from("profiles").select("id, username, display_name, country").in("id", Array.from(playerIds));
    const playerMap = new Map((players ?? []).map((p) => [p.id, p]));

    const now = Date.now();
    const enrichedBattles = (battles ?? []).map((b) => {
      const isStuck = b.status === "pending" && (b.game_id ? true : new Date(b.created_at).getTime() < now - 60_000);
      return {
        ...b,
        stakeUsd: roundUsd(fx.usdFromMwk(Number(b.stake || 0)) ?? 0),
        potUsd: roundUsd(fx.usdFromMwk(Number(b.pot || 0)) ?? 0),
        platformFeeUsd: roundUsd(fx.usdFromMwk(Number(b.platform_fee || 0)) ?? 0),
        winnerPayoutUsd: roundUsd(fx.usdFromMwk(Number(b.winner_payout || 0)) ?? 0),
        white_player: playerMap.get(b.white_player_id) || null,
        black_player: playerMap.get(b.black_player_id) || null,
        winner: b.winner_id ? playerMap.get(b.winner_id) || null : null,
        stuck: isStuck,
        pending_age_seconds: b.status === "pending" ? Math.floor((now - new Date(b.created_at).getTime()) / 1000) : null,
      };
    });

    const stats = await computeStats(admin, applyCommonFilters, stuckCutoffISO, fx);
    const availableCountries = await getAvailableCountries(admin, sinceISO);

    return NextResponse.json({ battles: enrichedBattles, total: count ?? 0, page, limit, stats, availableCountries });
  } catch (e: any) {
    console.error("[admin/battles] error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}

function applyStatusFilter(q: any, statusFilter: string, stuckCutoffISO: string) {
  switch (statusFilter) {
    case "pending": return q.eq("status", "pending");
    case "stuck": return q.eq("status", "pending").or(`game_id.not.is.null,created_at.lt.${stuckCutoffISO}`);
    case "playing": return q.in("status", ["playing", "draw_armageddon"]);
    case "completed": return q.eq("status", "completed");
    case "disputed": return q.eq("status", "disputed");
    case "cancelled": return q.eq("status", "cancelled");
    default: return q;
  }
}

async function computeStats(admin: ReturnType<typeof createAdminClient>, applyCommonFilters: (q: any) => any, stuckCutoffISO: string, fx: UsdConverter) {
  const countFor = async (statusFilter: string) => {
    let q = admin.from("battles").select("id", { count: "exact", head: true });
    q = applyCommonFilters(q);
    q = applyStatusFilter(q, statusFilter, stuckCutoffISO);
    const { count } = await q;
    return count ?? 0;
  };

  const [total, pending, stuck, playing, completed, disputed, cancelled] = await Promise.all([
    countFor("all"), countFor("pending"), countFor("stuck"), countFor("playing"),
    countFor("completed"), countFor("disputed"), countFor("cancelled"),
  ]);

  // fetchAll(): PostgREST silently caps responses at 1000 rows — unbounded
  // sums would freeze volume/revenue at exactly 1000 battles.
  const revenueRows = await fetchAll(() => {
    let q = admin.from("battles").select("pot, platform_fee").eq("status", "completed").eq("settled", true);
    return applyCommonFilters(q);
  });
  const totalVolume = revenueRows.reduce((sum: number, b: any) => sum + (b.pot || 0), 0);
  const totalRevenue = revenueRows.reduce((sum: number, b: any) => sum + (b.platform_fee || 0), 0);

  return {
    total, pending, stuck, playing, completed, disputed, cancelled,
    totalVolume, totalRevenue,
    totalVolumeUsd: roundUsd(fx.usdFromMwk(totalVolume) ?? 0),
    totalRevenueUsd: roundUsd(fx.usdFromMwk(totalRevenue) ?? 0),
  };
}

async function getAvailableCountries(admin: ReturnType<typeof createAdminClient>, sinceISO: string | null) {
  // fetchAll(): the old .limit(5000) was silently capped at 1000 rows by
  // PostgREST max-rows anyway; paginate past the cap properly.
  const rows = await fetchAll(() => {
    let q = admin.from("battles").select("white_player_id, black_player_id");
    if (sinceISO) q = q.gte("created_at", sinceISO);
    return q;
  });
  const ids = new Set<string>();
  for (const r of rows) { ids.add(r.white_player_id); ids.add(r.black_player_id); }
  if (ids.size === 0) return [];
  // fetchByIdChunks(): .in("id", [hundreds of uuids]) blows the ~8KB URL limit
  const countryRows = await fetchByIdChunks(
    () => admin.from("profiles").select("country").not("country", "is", null),
    Array.from(ids), "id");
  const counts = new Map<string, number>();
  for (const r of countryRows) { if (r.country) counts.set(r.country, (counts.get(r.country) || 0) + 1); }
  return Array.from(counts.entries()).map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
}
