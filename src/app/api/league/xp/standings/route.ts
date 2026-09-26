import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  getLeagueXpConfig,
  currentMonthStart,
  nextMonthStart,
  monthlyRewardArray,
  levelFor,
  XP_ALLOCATION,
  PLAYER_LEVELS,
  type PlayerLevel,
} from "@/lib/league-xp";

export const dynamic = "force-dynamic";

/**
 * GET /api/league/xp/standings — the single monthly XP leaderboard
 * (owner redesign 2026-09-26). One cycle: the calendar month. The only
 * player level is Club membership, which changes the XP rates — there
 * are no tiers, no promotion/demotion zone. Lifetime XP is maintained
 * forever alongside the resetting monthly total.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ authenticated: false }, { status: 401 });

    const admin = createAdminClient();
    const cfg = await getLeagueXpConfig(admin);

    const { data: member } = await admin
      .from("league_xp_members")
      .select("user_id, xp, week_start, lifetime_xp")
      .eq("user_id", user.id)
      .maybeSingle();

    const { data: profile } = await admin
      .from("profiles")
      .select("membership_until")
      .eq("id", user.id)
      .single();

    const cycleStart = currentMonthStart();
    const cycleEnd = nextMonthStart();
    const rewardsOn = cfg.rewards_enabled && cfg.monthly_rewards_enabled !== false;
    const monthlyPaused = cfg.monthly_rewards_enabled === false;

    const levelOf = (membershipUntil?: string | null): PlayerLevel =>
      levelFor(membershipUntil);

    // Not seeded yet — player has never finished a PvP game.
    if (!member) {
      return NextResponse.json({
        seeded: false,
        enabled: cfg.enabled,
        level: levelOf(profile?.membership_until),
        levelName: levelOf(profile?.membership_until) === "club" ? PLAYER_LEVELS[1].name : PLAYER_LEVELS[0].name,
        cycleStart,
        cycleEnd,
        xpRules: { allocation: XP_ALLOCATION, dailyCap: cfg.daily_xp_cap },
        rewards: rewardsOn ? monthlyRewardArray(cfg) : [],
        rewardsPaused: monthlyPaused,
        topCount: cfg.monthly_top_count ?? 5,
      });
    }

    /**
     * Games finished inside the month, per user, PvP only (bots
     * excluded) — the board shows cycle activity, not career totals.
     */
    const startIso = cycleStart + "T00:00:00+02:00";
    const endIso = cycleEnd + "T00:00:00+02:00";
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

    // Leaderboard = current cycle rows only (single board, all players).
    const { data: rows } = await admin
      .from("league_xp_members")
      .select("user_id, xp, lifetime_xp, profiles!inner(display_name, username, rating, country, membership_until)")
      .eq("week_start", cycleStart)
      .order("xp", { ascending: false })
      .order("updated_at", { ascending: true })
      .limit(100);
    const standings = (rows ?? []).map((r: any, i: number) => ({
      userId: r.user_id,
      name: r.profiles?.display_name || r.profiles?.username || "Player",
      rating: r.profiles?.rating ?? 400,
      country: r.profiles?.country ?? null,
      isClub: levelOf(r.profiles?.membership_until) === "club",
      games: counts.get(r.user_id) ?? 0,
      xp: Number(r.xp ?? 0),
      lifetimeXp: Number(r.lifetime_xp ?? 0),
      rank: i + 1,
      isMe: r.user_id === user.id,
    }));

    const myRow = standings.find((s: any) => s.isMe);
    const myLevel = levelOf(profile?.membership_until);

    return NextResponse.json({
      seeded: true,
      enabled: cfg.enabled,
      level: myLevel,
      levelName: myLevel === "club" ? PLAYER_LEVELS[1].name : PLAYER_LEVELS[0].name,
      myXp: myRow ? myRow.xp : 0,
      myRank: myRow?.rank ?? null,
      lifetimeXp: Number(member.lifetime_xp ?? 0),
      cycleStart,
      cycleEnd,
      standings,
      xpRules: { allocation: XP_ALLOCATION, dailyCap: cfg.daily_xp_cap },
      rewards: rewardsOn ? monthlyRewardArray(cfg) : [],
      rewardsPaused: monthlyPaused,
      topCount: cfg.monthly_top_count ?? 5,
    });
  } catch (err) {
    console.error("league xp standings error:", err);
    return NextResponse.json({ error: "Could not load standings" }, { status: 500 });
  }
}
