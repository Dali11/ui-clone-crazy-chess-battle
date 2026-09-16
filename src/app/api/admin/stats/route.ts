import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchAll } from "@/lib/supabase/fetch-all";
import { loadUsdConverter } from "@/lib/finance/usd";
import { getExchangeRate } from "@/lib/geo/fx";

/**
 * GET /api/admin/stats
 *
 * Query params (all optional):
 *   range   - "today" | "7d" | "30d" | "3m" | "6m" | "1y" | "all" (default "30d")
 *             Scopes the NEW range-based fields (rangeStats, revenueBreakdown, series).
 *             Does NOT affect the legacy top-level fields below — those stay all-time
 *             snapshots so the sidebar badges (pendingWithdrawals etc.) never change
 *             behavior regardless of the Overview panel's selected range.
 *   country - ISO 3166-1 alpha-2 code, or "all" (default "all"). Scopes rangeStats,
 *             revenueBreakdown, and series to users from that country.
 */

// CAT is UTC+2 year-round (no DST) — a fixed offset is exact.
// All day/week/month boundaries below anchor to CAT wall-clock, so "Today"
// means midnight Blantyre/Lusaka time — NOT UTC midnight (= 02:00 CAT) and
// NOT a rolling 24h window that spills into yesterday.
const CAT_OFFSET_MS = 2 * 60 * 60 * 1000;

/** Real UTC instant for a CAT wall-clock date/time. */
function catInstant(year: number, month: number, day: number, hour = 0): Date {
  return new Date(Date.UTC(year, month, day, hour) - CAT_OFFSET_MS);
}

/** CAT wall-clock date label (e.g. "14/9") for a UTC instant. */
function catDayLabel(t: Date): string {
  const c = new Date(t.getTime() + CAT_OFFSET_MS);
  return `${c.getUTCDate()}/${c.getUTCMonth() + 1}`;
}

interface Bucket {
  start: Date;
  end: Date;
  label: string;
}

function buildBuckets(range: string): Bucket[] {
  const cat = new Date(Date.now() + CAT_OFFSET_MS); // CAT wall-clock (read via UTC getters)
  const y = cat.getUTCFullYear();
  const mo = cat.getUTCMonth();
  const d = cat.getUTCDate();
  const h = cat.getUTCHours();
  const buckets: Bucket[] = [];

  if (range === "today" || range === "1d") {
    // "Today": midnight CAT → now, one bucket per elapsed CAT hour
    // (the last bucket is the current, partial hour). No yesterday spillover.
    for (let i = 0; i <= h; i++) {
      const start = catInstant(y, mo, d, i);
      buckets.push({ start, end: new Date(start.getTime() + 3600_000), label: `${String(i).padStart(2, "0")}:00` });
    }
    return buckets;
  }

  if (range === "7d" || range === "30d") {
    // Last N calendar days in CAT, today included as the final (partial) day.
    const days = range === "7d" ? 7 : 30;
    const todayMidnight = catInstant(y, mo, d);
    for (let i = days - 1; i >= 0; i--) {
      const start = new Date(todayMidnight.getTime() - i * 86_400_000);
      buckets.push({ start, end: new Date(start.getTime() + 86_400_000), label: catDayLabel(start) });
    }
    return buckets;
  }

  if (range === "3m" || range === "6m") {
    // Rolling weeks anchored to CAT midnight (last bucket covers today).
    const weeks = range === "3m" ? 13 : 26;
    const todayMidnight = catInstant(y, mo, d);
    for (let i = weeks - 1; i >= 0; i--) {
      const end = new Date(todayMidnight.getTime() + 86_400_000 - i * 7 * 86_400_000);
      const start = new Date(end.getTime() - 7 * 86_400_000);
      buckets.push({ start, end, label: catDayLabel(start) });
    }
    return buckets;
  }

  // "1y" / "all" — 12 monthly buckets on CAT calendar months.
  for (let i = 11; i >= 0; i--) {
    const start = catInstant(y, mo - i, 1);
    const end = catInstant(y, mo - i + 1, 1);
    const c = new Date(start.getTime() + CAT_OFFSET_MS);
    buckets.push({ start, end, label: c.toLocaleString("en-US", { month: "short", timeZone: "UTC" }) });
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
    // Withdrawal rows are stored in each player's own currency (null = pre-080 MWK)
    // — normalize to MWK so platform totals are coherent.
    const fx = await loadUsdConverter(admin, async () => getExchangeRate("MWK", "USD"));
    const { data: profile } = await admin
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();
    if (!profile?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") || "30d";
    const country = searchParams.get("country") || "all";

    const cat = new Date(Date.now() + CAT_OFFSET_MS);
    const todayISO = catInstant(cat.getUTCFullYear(), cat.getUTCMonth(), cat.getUTCDate()).toISOString();

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

    const { count: openIntegrityFlags } = await admin
      .from("integrity_flags").select("id", { count: "exact", head: true })
      .eq("status", "open");

    const depositsData = await fetchAll(() =>
      admin.from("deposits").select("amount")
        .eq("status", "success")
        .in("method", ["mobile_money", "card"]));
    const totalDeposits = depositsData.reduce((sum: number, d: any) => sum + (d.amount || 0), 0);

    const withdrawalsData = await fetchAll(() =>
      admin.from("withdrawals").select("amount, currency")
        .eq("status", "completed"));
    const totalWithdrawals = withdrawalsData.reduce((sum: number, w: any) => sum + (fx.toMwk(w.amount || 0, w.currency) ?? (w.amount || 0)), 0);

    const completedBattles = await fetchAll(() =>
      admin.from("battles")
        .select("pot, platform_fee")
        .eq("status", "completed")
        .eq("settled", true));

    const totalBattleVolume = completedBattles.reduce((sum: number, b: any) => sum + (b.pot || 0), 0);
    const battleRevenueAllTime = completedBattles.reduce((sum: number, b: any) => sum + (b.platform_fee || 0), 0);

    // NOTE: the platform takes NO cut from tournaments — see lib/tournament/economics.ts
    // (platformCut is always 0; only a tournament's creator can take a profit %, and that
    // money goes to the creator, never the platform). Tournament revenue is therefore
    // always 0 and must not be fabricated from entry fees here.
    const tournamentRevenueAllTime = 0;
    const platformRevenue = battleRevenueAllTime + tournamentRevenueAllTime;

    const tournamentsData = await fetchAll(() =>
      admin.from("tournaments").select("prize_pool")
        .neq("status", "cancelled"));
    let totalPrizePools = 0;
    for (const t of tournamentsData) {
      totalPrizePools += t.prize_pool || 0;
    }

    // Creator earnings from entry-fee tournaments with a creator profit %.
    // This money goes to the tournament creator, NOT the platform — tracked
    // separately from platform revenue. Mirrors computeTournamentEconomics()
    // in lib/tournament/economics.ts.
    const creatorTournaments = await fetchAll(() =>
      admin.from("tournaments").select("prize_pool, creator_profit_percent")
        .eq("status", "finished")
        .neq("pool_source", "fixed")
        .gt("creator_profit_percent", 0));
    let creatorEarningsAllTime = 0;
    for (const t of creatorTournaments) {
      const gross = t.prize_pool || 0;
      if (gross > 0) creatorEarningsAllTime += Math.floor(gross * ((t.creator_profit_percent || 0) / 100));
    }

    const walletLiquidity = totalDeposits - totalWithdrawals;

    // ───────────────────────── NEW RANGE-SCOPED FIELDS ─────────────────────────

    const buckets = buildBuckets(range);
    const sinceISO = buckets[0].start.toISOString();

    // All profiles (id, created_at, country) — used for country filtering,
    // new-user counts, and the country filter dropdown. Paginated past the
    // 1000-row max-rows cap.
    const allProfiles = await fetchAll(() =>
      admin.from("profiles").select("id, created_at, country"));

    const countryCounts = new Map<string, number>();
    for (const p of allProfiles) {
      if (p.country) countryCounts.set(p.country, (countryCounts.get(p.country) || 0) + 1);
    }
    const availableCountries = Array.from(countryCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count);

    const countryIdSet: Set<string> | null = country !== "all"
      ? new Set(allProfiles.filter((p: any) => p.country === country).map((p: any) => p.id))
      : null;
    const noCountryMatch = countryIdSet !== null && countryIdSet.size === 0;

    // NOTE: country filtering happens IN MEMORY via countryIdSet, never via
    // .in(user_id, [...]) URL filters — 200+ UUIDs in a query string blows
    // past the ~8KB gateway URL limit and the request starts failing.
    const newUsersInRange = allProfiles.filter((p: any) => {
      if (new Date(p.created_at).getTime() < new Date(sinceISO).getTime()) return false;
      if (countryIdSet && !countryIdSet.has(p.id)) return false;
      return true;
    }).length;

    // Deposits in range
    let depositsInRange = 0;
    const depositSeries = new Array(buckets.length).fill(0);
    if (!noCountryMatch) {
      const rows = await fetchAll(() =>
        admin.from("deposits").select("created_at, amount, user_id")
          .eq("status", "success").in("method", ["mobile_money", "card"])
          .gte("created_at", sinceISO));
      for (const r of rows) {
        if (countryIdSet && !countryIdSet.has(r.user_id)) continue;
        depositsInRange += r.amount || 0;
        const idx = bucketIndexFor(buckets, r.created_at);
        if (idx >= 0) depositSeries[idx] += r.amount || 0;
      }
    }

    // Withdrawals in range
    let withdrawalsInRange = 0;
    const withdrawalSeries = new Array(buckets.length).fill(0);
    if (!noCountryMatch) {
      const rows = await fetchAll(() =>
        admin.from("withdrawals").select("created_at, amount, currency, user_id")
          .eq("status", "completed").gte("created_at", sinceISO));
      for (const r of rows) {
        if (countryIdSet && !countryIdSet.has(r.user_id)) continue;
        const mwkAmt = fx.toMwk(r.amount || 0, r.currency) ?? (r.amount || 0);
        withdrawalsInRange += mwkAmt;
        const idx = bucketIndexFor(buckets, r.created_at);
        if (idx >= 0) withdrawalSeries[idx] += mwkAmt;
      }
    }

    // Battle volume + revenue in range
    let battleVolumeInRange = 0;
    let battleRevenueInRange = 0;
    const revenueSeries = new Array(buckets.length).fill(0);
    if (!noCountryMatch) {
      const rows = await fetchAll(() =>
        admin.from("battles").select("created_at, pot, platform_fee, white_player_id, black_player_id")
          .eq("status", "completed").eq("settled", true).gte("created_at", sinceISO));
      for (const r of rows) {
        if (countryIdSet && !countryIdSet.has(r.white_player_id) && !countryIdSet.has(r.black_player_id)) continue;
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
      const rows = await fetchAll(() =>
        admin.from("games").select("created_at, white_player_id, black_player_id")
          .gte("created_at", sinceISO));
      for (const r of rows) {
        if (countryIdSet && !countryIdSet.has(r.white_player_id) && !countryIdSet.has(r.black_player_id)) continue;
        gamesInRange += 1;
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

    // Creator earnings in range — tournaments that ENDED within the window.
    // Creator profit goes to the tournament creator, not the platform.
    let creatorEarningsInRange = 0;
    if (!noCountryMatch) {
      const endedInRange = await fetchAll(() =>
        admin.from("tournaments").select("prize_pool, creator_profit_percent")
          .eq("status", "finished")
          .neq("pool_source", "fixed")
          .gt("creator_profit_percent", 0)
          .gte("ended_at", sinceISO));
      for (const t of endedInRange) {
        const gross = t.prize_pool || 0;
        if (gross > 0) creatorEarningsInRange += Math.floor(gross * ((t.creator_profit_percent || 0) / 100));
      }
    }

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
      openIntegrityFlags: openIntegrityFlags ?? 0,
      totalDeposits,
      totalWithdrawals,
      totalBattleVolume,
      platformRevenue,
      creatorEarningsAllTime,
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
        creatorEarnings: creatorEarningsInRange,
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
