import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getLeagueXpConfig, currentWeekStart, nextWeekStart, LEAGUE_TIERS, rewardsForTier, allTierRewards } from "@/lib/league-xp";

export const dynamic = "force-dynamic";

/**
 * GET /api/league/xp/standings — the signed-in player's XP league:
 * membership, tier leaderboard, rank, cycle end, reward/XP rules.
 */
export async function GET(_req: NextRequest) {
  try {
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
        xpRules: { win: cfg.xp_win, draw: cfg.xp_draw, loss: cfg.xp_loss, upsetBonus: cfg.xp_upset_bonus, dailyCap: cfg.daily_xp_cap },
        rewards: cfg.rewards_enabled ? rewardsForTier(cfg, 1) : [],
        tierRewards: cfg.rewards_enabled ? allTierRewards(cfg) : {},
        tiers: LEAGUE_TIERS,
      });
    }

    const week = currentWeekStart();

    // Leaderboard = current cycle rows only. (A stale row — game finished in
    // the minutes between Monday 00:00 and the settle cron — displays 0 XP;
    // the cron's reset makes this self-correcting.)
    const { data: rows } = await admin
      .from("league_xp_members")
      .select("user_id, xp, profiles!inner(display_name, username, rating)")
      .eq("tier", member.tier)
      .eq("week_start", week)
      .order("xp", { ascending: false })
      .order("updated_at", { ascending: true })
      .limit(100);

    const standings = (rows ?? []).map((r: any, i: number) => ({
      userId: r.user_id,
      name: r.profiles?.display_name || r.profiles?.username || "Player",
      rating: r.profiles?.rating ?? 400,
      xp: r.xp ?? 0,
      rank: i + 1,
      isMe: r.user_id === user.id,
    }));

    const myRow = standings.find((s: any) => s.isMe);
    const myXp = member.week_start === week ? member.xp : 0;
    const myRank = myRow?.rank ?? null;

    return NextResponse.json({
      seeded: true,
      enabled: cfg.enabled,
      tier: LEAGUE_TIERS.find((t) => t.tier === member.tier) ?? LEAGUE_TIERS[0],
      myXp,
      myRank,
      promoteCount: cfg.promote_count,
      demoteCount: cfg.demote_count,
      tierCap: cfg.tier_cap ?? 1000,
      cycleStart: week,
      cycleEnd: nextWeekStart(),
      standings,
      xpRules: { win: cfg.xp_win, draw: cfg.xp_draw, loss: cfg.xp_loss, upsetBonus: cfg.xp_upset_bonus, dailyCap: cfg.daily_xp_cap },
      // Payout for the player's own league; tierRewards covers all leagues.
      rewards: cfg.rewards_enabled ? rewardsForTier(cfg, member.tier) : [],
      tierRewards: cfg.rewards_enabled ? allTierRewards(cfg) : {},
      tiers: LEAGUE_TIERS,
    });
  } catch (err) {
    console.error("league xp standings error:", err);
    return NextResponse.json({ error: "Could not load standings" }, { status: 500 });
  }
}
