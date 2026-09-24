import { rewardsCurrency as rewardsCurrencyOf } from "@/lib/league-xp";
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

    // XP boost state (owner decision 2026-09-15): referral boost from the
    // league row, member 1.5x from the profile, and the rolling count of
    // referrals activated this week for the "X more to next tier" nudge.
    const { data: profile } = await admin
      .from("profiles")
      .select("membership_until")
      .eq("id", user.id)
      .single();
    const { count: activeReferrals } = await admin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", user.id)
      .gt("activated_at", new Date(Date.now() - 7 * 86_400_000).toISOString());
    const boostUntil = member?.xp_boost_until ?? null;
    const boostActive = !!boostUntil && new Date(boostUntil).getTime() > Date.now();
    const xpBoost = boostActive
      ? { multiplier: member?.xp_boost_multiplier ?? 1, until: boostUntil }
      : null;
    const memberBoostActive = !!profile?.membership_until && new Date(profile.membership_until).getTime() > Date.now();

    // Not seeded yet — player has never finished a PvP game.
    if (!member) {
      return NextResponse.json({
        seeded: false,
        enabled: cfg.enabled,
        scope,
        xpRules: { win: cfg.xp_win, draw: cfg.xp_draw, loss: cfg.xp_loss, upsetBonus: cfg.xp_upset_bonus, dailyCap: cfg.daily_xp_cap },
        rewards: cfg.rewards_enabled && cfg.weekly_payouts_enabled !== false ? rewardsForTier(cfg, 1) : [],
        tierRewards: cfg.rewards_enabled && cfg.weekly_payouts_enabled !== false ? allTierRewards(cfg) : {},
        // Cash-rewards pause surface (owner 2026-09-24): the UI hides all
        // payout figures and shows a paused note while these are true.
        weeklyRewardsPaused: cfg.weekly_payouts_enabled === false,
        monthlyRewardsPaused: cfg.monthly_rewards_enabled === false,
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

    /**
     * Games played inside a window, per user, PvP only (bots excluded) —
     * the standings show cycle activity, not career totals. Owner policy
     * 2026-09-11: the Games column counts games finished in the current
     * week (or month for the championship scope).
     */
    const cycleGameCounts = async (winStart: string, winEnd: string) => {
      const startIso = winStart + "T00:00:00+02:00";
      const endIso = winEnd + "T00:00:00+02:00";
      const { data: bots } = await admin
        .from("profiles")
        .select("id")
        .like("email", "%@ccb.internal");
      const botIds = new Set((bots ?? []).map((b: any) => b.id));
      const counts = new Map<string, number>();
      const tally = (rows: any[] | null | undefined) => {
        for (const g of rows ?? []) {
          if (botIds.has(g.white_player_id) || botIds.has(g.black_player_id)) continue;
          counts.set(g.white_player_id, (counts.get(g.white_player_id) ?? 0) + 1);
          counts.set(g.black_player_id, (counts.get(g.black_player_id) ?? 0) + 1);
        }
      };
      const [{ data: chess }, { data: draughts }] = await Promise.all([
        admin
          .from("games")
          .select("white_player_id, black_player_id")
          .gte("ended_at", startIso)
          .lt("ended_at", endIso)
          .neq("status", "abort")
          .limit(10000),
        admin
          .from("draughts_games")
          .select("white_player_id, black_player_id")
          .gte("ended_at", startIso)
          .lt("ended_at", endIso)
          .neq("status", "abort")
          .limit(10000),
      ]);
      tally(chess);
      tally(draughts);
      return counts;
    };

    if (scope === "month") {
      // Monthly championship: aggregate the events audit log over the
      // calendar month for everyone in the player's tier.
      cycleStart = currentMonthStart();
      cycleEnd = nextMonthStart();
      // Season 1 began 2026-09-11 — the first championship month counts XP
      // only from that date (owner policy 2026-09-11).
      const monthCycleStart = (cfg.season_start && cfg.season_start > cycleStart)
        ? cfg.season_start
        : cycleStart;
      const monthGames = await cycleGameCounts(monthCycleStart, cycleEnd);
      const { data: events } = await admin
        .from("league_xp_events")
        .select("user_id, amount")
        .gte("created_at", monthCycleStart + "T00:00:00+02:00")
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
          games: monthGames.get(r.user_id) ?? 0,
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
      // Season 1 began 2026-09-11 mid-week (calendar week 08-14) — clamp
      // the Games window to season start so it can't count pre-season
      // games from before the XP reset (same clamp the monthly scope
      // uses below). Owner-reported 2026-09-11: Games showed nonzero on
      // day 1 while XP correctly showed 0.
      const weekGamesStart = (cfg.season_start && cfg.season_start > cycleStart)
        ? cfg.season_start
        : cycleStart;
      const weekGames = await cycleGameCounts(weekGamesStart, cycleEnd);
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
        games: weekGames.get(r.user_id) ?? 0,
        xp: r.xp ?? 0,
        rank: i + 1,
        isMe: r.user_id === user.id,
      }));
      myXp = member.week_start === cycleStart ? member.xp : 0;
    }

    const myRow = standings.find((s: any) => s.isMe);
    const myRank = myRow?.rank ?? null;

    // All-time rolling XP — every event ever earned, never resets.
    const { data: myEvents } = await admin
      .from("league_xp_events")
      .select("amount")
      .eq("user_id", user.id);
    const allTimeXp = (myEvents ?? []).reduce((s, e) => s + (e.amount ?? 0), 0);
    const rewardsOn = cfg.rewards_enabled;
    const monthlyOn = cfg.monthly_rewards_enabled !== false && rewardsOn;
    // Cash-rewards pause (owner 2026-09-24): the weekly/monthly kill
    // switches also hide the figures from the UI while payouts are off.
    const weeklyPaused = cfg.weekly_payouts_enabled === false;
    const monthlyPaused = cfg.monthly_rewards_enabled === false;

    return NextResponse.json({
      seeded: true,
      enabled: cfg.enabled,
      scope,
      tier: LEAGUE_TIERS.find((t) => t.tier === member.tier) ?? LEAGUE_TIERS[0],
      myXp,
      myRank,
      allTimeXp: allTimeXp ?? 0,
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
        ? (monthlyOn && !monthlyPaused ? monthlyRewardsForTier(cfg, member.tier) : [])
        : (rewardsOn && !weeklyPaused ? rewardsForTier(cfg, member.tier) : []),
      tierRewards: scope === "month"
        ? (monthlyOn && !monthlyPaused ? allMonthlyTierRewards(cfg) : {})
        : (rewardsOn && !weeklyPaused ? allTierRewards(cfg) : {}),
      weeklyRewardsPaused: weeklyPaused,
      monthlyRewardsPaused: monthlyPaused,
      tiers: LEAGUE_TIERS,
      rewardsCurrency: scope === "month" ? "MWK" : rewardsCurrencyOf(cfg),
      // XP boost surface (owner decision 2026-09-15)
      xpBoost,
      memberBoost: memberBoostActive,
      activeReferrals: activeReferrals ?? 0,
    });
  } catch (err) {
    console.error("league xp standings error:", err);
    return NextResponse.json({ error: "Could not load standings" }, { status: 500 });
  }
}
