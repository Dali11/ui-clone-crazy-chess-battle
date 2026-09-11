import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getLeagueXpConfig, currentWeekStart, nextWeekStart, currentMonthStart, nextMonthStart, LEAGUE_TIERS, rewardsForTier, allTierRewards, monthlyRewardsForTier, allMonthlyTierRewards } from "@/lib/league-xp";

export const dynamic = "force-dynamic";

/**
 * GET /api/league/xp/standings?scope=week|month — the signed-in player's
 * XP league: membership, tier leaderboard, rank, cycle end, reward/XP
 * rules. Two parallel leaderboards share tiers and XP:
 *   - week  (default): the Monday-reset ladder with promotion/demotion.
 *   - month: the calendar-month championship — rewards only, no moves.
 */
export async function GET(req: NextRequest) {
  try {
    const scope = new URL(req.url).searchParams.get("scope") === "month" ? "month" : "week";
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ authenticated: false }, { status: 401 });

    const admin = createAdminClient();
    const cfg = await getLeagueXpConfig(admin);

    const { data: member } = await admin
      .from("league_xp_members")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    // Not seeded yet — player has never finished a PvP game.
    if (!member) {
      return NextResponse.json({
        seeded: false,
        enabled: cfg.enabled,
        scope,
        xpRules: { win: cfg.xp_win, draw: cfg.xp_draw, loss: cfg.xp_loss, upsetBonus: cfg.xp_upset_bonus, dailyCap: cfg.daily_xp_cap },
        rewards: cfg.rewards_enabled ? rewardsForTier(cfg, 1) : [],
        tierRewards: cfg.rewards_enabled ? allTierRewards(cfg) : {},
        tiers: LEAGUE_TIERS,
        registrationOpen: cfg.registration_open !== false,
        seasonStart: cfg.season_start ?? null,
        tierCap: cfg.tier_cap,
      });
    }

    let standings: any[] = [];
    let cycleStart: string;
    let cycleEnd: string;
    let myXp = 0;

    if (scope === "month") {
      // Monthly championship: aggregate the events audit log over the
      // calendar month for everyone in the player's tier.
      cycleStart = currentMonthStart();
      cycleEnd = nextMonthStart();
      const { data: events } = await admin
        .from("league_xp_events")
        .select("user_id, amount")
        .gte("created_at", cycleStart + "T00:00:00+02:00")
        .lt("created_at", cycleEnd + "T00:00:00+02:00");
      const xpByUser = new Map<string, number>();
      for (const ev of events ?? []) {
        xpByUser.set(ev.user_id, (xpByUser.get(ev.user_id) ?? 0) + ev.amount);
      }
      const { data: tierRows } = await admin
        .from("league_xp_members")
        .select("user_id, profiles!inner(display_name, username, rating, country, games_played)")
        .eq("tier", member.tier);
      standings = (tierRows ?? [])
        .filter((r: any) => xpByUser.has(r.user_id))
        .map((r: any) => ({
          userId: r.user_id,
          name: r.profiles?.display_name || r.profiles?.username || "Player",
          rating: r.profiles?.rating ?? 400,
          country: r.profiles?.country ?? null,
          games: r.profiles?.games_played ?? 0,
          xp: xpByUser.get(r.user_id) ?? 0,
          isMe: r.user_id === user.id,
        }))
        .sort((a: any, b: any) => b.xp - a.xp)
        .slice(0, 100)
        .map((r: any, i: number) => ({ ...r, rank: i + 1 }));
      myXp = xpByUser.get(user.id) ?? 0;
    } else {
      cycleStart = currentWeekStart();
      cycleEnd = nextWeekStart();
      // Leaderboard = current cycle rows only. (A stale row — game finished
      // in the minutes between Monday 00:00 and the settle cron — displays
      // 0 XP; the cron's reset makes this self-correcting.)
      const { data: rows } = await admin
        .from("league_xp_members")
        .select("user_id, xp, profiles!inner(display_name, username, rating, country, games_played)")
        .eq("tier", member.tier)
        .eq("week_start", cycleStart)
        .order("xp", { ascending: false })
        .order("updated_at", { ascending: true })
        .limit(100);
      standings = (rows ?? []).map((r: any, i: number) => ({
        userId: r.user_id,
        name: r.profiles?.display_name || r.profiles?.username || "Player",
        rating: r.profiles?.rating ?? 400,
        country: r.profiles?.country ?? null,
        games: r.profiles?.games_played ?? 0,
        xp: r.xp ?? 0,
        rank: i + 1,
        isMe: r.user_id === user.id,
      }));
      myXp = member.week_start === cycleStart ? member.xp : 0;
    }

    const myRow = standings.find((s: any) => s.isMe);
    const myRank = myRow?.rank ?? null;
    const rewardsOn = cfg.rewards_enabled;
    const monthlyOn = cfg.monthly_rewards_enabled !== false && rewardsOn;

    return NextResponse.json({
      seeded: true,
      enabled: cfg.enabled,
      scope,
      tier: LEAGUE_TIERS.find((t) => t.tier === member.tier) ?? LEAGUE_TIERS[0],
      myXp,
      myRank,
      promoteCount: scope === "month" ? (cfg.monthly_top_count ?? 5) : cfg.promote_count,
      demoteCount: scope === "month" ? 0 : cfg.demote_count,
      tierCap: cfg.tier_cap ?? 1000,
      registrationOpen: cfg.registration_open !== false,
      seasonStart: cfg.season_start ?? null,
      cycleStart,
      cycleEnd,
      standings,
      xpRules: { win: cfg.xp_win, draw: cfg.xp_draw, loss: cfg.xp_loss, upsetBonus: cfg.xp_upset_bonus, dailyCap: cfg.daily_xp_cap },
      // Payout for the player's own league; tierRewards covers all leagues.
      rewards: scope === "month"
        ? (monthlyOn ? monthlyRewardsForTier(cfg, member.tier) : [])
        : (rewardsOn ? rewardsForTier(cfg, member.tier) : []),
      tierRewards: scope === "month"
        ? (monthlyOn ? allMonthlyTierRewards(cfg) : {})
        : (rewardsOn ? allTierRewards(cfg) : {}),
      tiers: LEAGUE_TIERS,
    });
  } catch (err) {
    console.error("league xp standings error:", err);
    return NextResponse.json({ error: "Could not load standings" }, { status: 500 });
  }
}
