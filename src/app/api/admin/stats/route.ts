import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/stats
 *
 * Query params (all optional):
 *   range   - "1d" | "7d" | "30d" | "3m" | "6m" | "1y" | "all" (default "30d")
 *             Scopes the NEW range-based fields (rangeStats, revenueBreakdown, series).
 *             Does NOT affect the legacy top-level fields below — those stay all-time
 *             snapshots so the sidebar badges (pendingWithdrawals etc.) never change
 *             behavior regardless of the Overview panel's selected range.
 *   country - ISO 3166-1 alpha-2 code, or "all" (default "all"). Scopes rangeStats,
 *             revenueBreakdown, and series to users from that country.
 */

const RANGE_MS: Record<string, number | null> = {
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
  "3m": 90 * 24 * 60 * 60 * 1000,
  "6m": 180 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
  all: null,
};

interface Bucket {
  start: Date;
  end: Date;
  label: string;
}

function buildBuckets(range: string): Bucket[] {
  const now = new Date();
  const buckets: Bucket[] = [];

  if (range === "1d") {
    const startHour = new Date(now);
    startHour.setMinutes(0, 0, 0);
    for (let i = 23; i >= 0; i--) {
      const start = new Date(startHour.getTime() - i * 3600_000);
      const end = new Date(start.getTime() + 3600_000);
      buckets.push({ start, end, label: `${String(start.getHours()).padStart(2, "0")}:00` });
    }
  } else if (range === "7d" || range === "30d") {
    const days = range === "7d" ? 7 : 30;
    const startDay = new Date(now);
    startDay.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(startDay.getTime() - i * 86_400_000);
      const end = new Date(start.getTime() + 86_400_000);
      buckets.push({ start, end, label: `${start.getDate()}/${start.getMonth() + 1}` });
    }
  } else if (range === "3m" || range === "6m") {
    const weeks = range === "3m" ? 13 : 26;
    const startDay = new Date(now);
    startDay.setHours(0, 0, 0, 0);
    for (let i = weeks - 1; i >= 0; i--) {
      const end = new Date(startDay.getTime() - i * 7 * 86_400_000 + 86_400_000);
      const start = new Date(end.getTime() - 7 * 86_400_000);
      buckets.push({ start, end, label: `${start.getDate()}/${start.getMonth() + 1}` });
    }
  } else {
    // "1y" or "all" — 12 monthly buckets
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({ start, end, label: start.toLocaleString("en-US", { month: "short" }) });
    }
  }
  return buckets;
}

function bucketIndexFor(buckets: Bucket[], dateStr: string): number {
  const t = new Date(dateStr).getTime();
  for (let i = 0; i < buckets.length; i++) {
    if (t >= buckets[i].start.getTime() && t < buckets[i].end.getTime()) return i;
  }
  return -1;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "30d";
    const country = searchParams.get("country") || "all";

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    // ───────────────────────── LEGACY ALL-TIME FIELDS ─────────────────────────
    // Unchanged from before — sidebar badges and other consumers depend on these
    // being all-time snapshots regardless of the Overview panel's range filter.

    const { count: totalUsers } = await admin
      .from("profiles").select("*", { count: "exact", head: true });

    const { count: gamesToday } = await admin
      .from("games").select("*", { count: "exact", head: true })
      .gte("created_at", todayISO);

    const { count: totalGames } = await admin
      .from("games").select("*", { count: "exact", head: true });

    const { count: activeTournaments } = await admin
      .from("tournaments").select("*", { count: "exact", head: true })
      .in("status", ["upcoming", "active"]);

    const { count: pendingTournamentApprovals } = await admin
      .from("tournaments").select("*", { count: "exact", head: true })
      .eq("status", "pending_approval");

    const { count: pendingWithdrawals } = await admin
      .from("withdrawals").select("*", { count: "exact", head: true })
      .eq("status", "pending");

    const { count: pendingDeposits } = await admin
      .from("deposits").select("*", { count: "exact", head: true })
      .in("status", ["pending", "processing"]);

    const { data: depositsData } = await admin
      .from("deposits").select("amount")
      .eq("status", "success")
      .in("method", ["mobile_money", "card"]);
    const totalDeposits = depositsData?.reduce((sum, d) => sum + (d.amount || 0), 0) || 0;

    const { data: withdrawalsData } = await admin
      .from("withdrawals").select("amount")
      .eq("status", "completed");
    const totalWithdrawals = withdrawalsData?.reduce((sum, w) => sum + (w.amount || 0), 0) || 0;

    const { data: completedBattles } = await admin
      .from("battles")
      .select("pot, platform_fee")
      .eq("status", "completed")
      .eq("settled", true);

    const totalBattleVolume = completedBattles?.reduce((sum, b) => sum + (b.pot || 0), 0) || 0;
    const battleRevenueAllTime = completedBattles?.reduce((sum, b) => sum + (b.platform_fee || 0), 0) || 0;

    // NOTE: the platform takes NO cut from tournaments — see lib/tournament/economics.ts
    // (platformCut is always 0; only a tournament's creator can take a profit %, and that
    // money goes to the creator, never the platform). Tournament revenue is therefore
    // always 0 and must not be fabricated from entry fees here.
    const tournamentRevenueAllTime = 0;
    const platformRevenue = battleRevenueAllTime + tournamentRevenueAllTime;

    const { data: tournamentsData } = await admin
      .from("tournaments").select("prize_pool")
      .neq("status", "cancelled");
    let totalPrizePools = 0;
    for (const t of tournamentsData || []) {
      totalPrizePools += t.prize_pool || 0;
    }

    const walletLiquidity = totalDeposits - totalWithdrawals;

    // ───────────────────────── NEW RANGE-SCOPED FIELDS ─────────────────────────

    const buckets = buildBuckets(range);
    const sinceISO = buckets[0].start.toISOString();

    // All profiles (id, created_at, country) — cheap at current scale, used for
    // country filtering, new-user counts, and the country filter dropdown.
    const { data: allProfiles } = await admin
      .from("profiles").select("id, created_at, country").limit(20000);

    const countryCounts = new Map<string, number>();
    for (const p of allProfiles || []) {
      if (p.country) countryCounts.set(p.country, (countryCounts.get(p.country) || 0) + 1);
    }
    const availableCountries = Array.from(countryCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);

    const countryIds: string[] | null = country !== "all"
      ? (allProfiles || []).filter((p) => p.country === country).map((p) => p.id)
      : null;
    const noCountryMatch = countryIds !== null && countryIds.length === 0;

    const newUsersInRange = (allProfiles || []).filter((p) => {
      if (new Date(p.created_at).getTime() < new Date(sinceISO).getTime()) return false;
      if (countryIds && !countryIds.includes(p.id)) return false;
      return true;
    }).length;

    // Deposits in range
    let depositsInRange = 0;
    const depositSeries = new Array(buckets.length).fill(0);
    if (!noCountryMatch) {
      let q = admin.from("deposits").select("created_at, amount, user_id")
        .eq("status", "success").in("method", ["mobile_money", "card"])
        .gte("created_at", sinceISO);
      if (countryIds) q = q.in("user_id", countryIds);
      const { data: rows } = await q;
      for (const r of rows || []) {
        depositsInRange += r.amount || 0;
        const idx = bucketIndexFor(buckets, r.created_at);
        if (idx >= 0) depositSeries[idx] += r.amount || 0;
      }
    }

    // Withdrawals in range
    let withdrawalsInRange = 0;
    const withdrawalSeries = new Array(buckets.length).fill(0);
    if (!noCountryMatch) {
      let q = admin.from("withdrawals").select("created_at, amount, user_id")
        .eq("status", "completed").gte("created_at", sinceISO);
      if (countryIds) q = q.in("user_id", countryIds);
      const { data: rows } = await q;
      for (const r of rows || []) {
        withdrawalsInRange += r.amount || 0;
        const idx = bucketIndexFor(buckets, r.created_at);
        if (idx >= 0) withdrawalSeries[idx] += r.amount || 0;
      }
    }

    // Battle volume + revenue in range
    let battleVolumeInRange = 0;
    let battleRevenueInRange = 0;
    const revenueSeries = new Array(buckets.length).fill(0);
    if (!noCountryMatch) {
      let q = admin.from("battles").select("created_at, pot, platform_fee, white_player_id, black_player_id")
        .eq("status", "completed").eq("settled", true).gte("created_at", sinceISO);
      if (countryIds) {
        const idList = countryIds.join(",");
        q = q.or(`white_player_id.in.(${idList}),black_player_id.in.(${idList})`);
      }
      const { data: rows } = await q;
      for (const r of rows || []) {
        battleVolumeInRange += r.pot || 0;
        battleRevenueInRange += r.platform_fee || 0;
        const idx = bucketIndexFor(buckets, r.created_at);
        if (idx >= 0) revenueSeries[idx] += r.platform_fee || 0;
      }
    }

    // Games in range
    let gamesInRange = 0;
    const gamesSeries = new Array(buckets.length).fill(0);
    if (!noCountryMatch) {
      let q = admin.from("games").select("created_at, white_player_id, black_player_id")
        .gte("created_at", sinceISO);
      if (countryIds) {
        const idList = countryIds.join(",");
        q = q.or(`white_player_id.in.(${idList}),black_player_id.in.(${idList})`);
      }
      const { data: rows } = await q;
      gamesInRange = rows?.length || 0;
      for (const r of rows || []) {
        const idx = bucketIndexFor(buckets, r.created_at);
        if (idx >= 0) gamesSeries[idx] += 1;
      }
    }

    // Tournament revenue in range: the platform takes NO cut from tournaments — see
    // lib/tournament/economics.ts (platformCut is always 0; only a tournament's creator
    // can take a profit %, and that money goes to the creator, never the platform).
    // Was previously fabricated as 10% of entry fees via a query filtering on a
    // "updated_at" column that doesn't exist on `tournaments` (silently returned 0 anyway).
    const tournamentRevenueInRange = 0;

    const platformRevenueInRange = battleRevenueInRange + tournamentRevenueInRange;
    const netFlowInRange = depositsInRange - withdrawalsInRange;

    const series = buckets.map((b, i) => ({
      label: b.label,
      deposits: depositSeries[i],
      withdrawals: withdrawalSeries[i],
      revenue: revenueSeries[i],
      games: gamesSeries[i],
    }));

    return NextResponse.json({
      // Legacy all-time fields
      totalUsers: totalUsers ?? 0,
      gamesToday: gamesToday ?? 0,
      totalGames: totalGames ?? 0,
      activeTournaments: activeTournaments ?? 0,
      pendingTournamentApprovals: pendingTournamentApprovals ?? 0,
      pendingWithdrawals: pendingWithdrawals ?? 0,
      pendingDeposits: pendingDeposits ?? 0,
      totalDeposits,
      totalWithdrawals,
      totalBattleVolume,
      platformRevenue,
      totalPrizePools,
      walletLiquidity,

      // New range-scoped fields
      range,
      country,
      availableCountries,
      rangeStats: {
        newUsers: newUsersInRange,
        games: gamesInRange,
        deposits: depositsInRange,
        withdrawals: withdrawalsInRange,
        battleVolume: battleVolumeInRange,
        battleRevenue: battleRevenueInRange,
        tournamentRevenue: tournamentRevenueInRange,
        platformRevenue: platformRevenueInRange,
        netFlow: netFlowInRange,
      },
      revenueBreakdown: {
        battleRevenue: battleRevenueInRange,
        tournamentRevenue: tournamentRevenueInRange,
        total: platformRevenueInRange,
      },
      series,
    });
  } catch (err: any) {
    console.error("[admin/stats] error:", err);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
