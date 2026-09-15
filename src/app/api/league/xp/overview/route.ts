import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getLeagueXpConfig, currentWeekStart, LEAGUE_TIERS, rewardsForTier, monthlyRewardsForTier, rewardsCurrency } from "@/lib/league-xp";

export const dynamic = "force-dynamic";

/**
 * All-leagues overview for the League page "Overview" tab: for each of the
 * five tiers — roster size, weekly + monthly reward tables, and the top 5
 * players of the current XP week. Authenticated read-only.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const cfg = await getLeagueXpConfig(admin);
  const week = currentWeekStart();

  const { data: members, error } = await admin
    .from("league_xp_members")
    .select("user_id, tier, xp, week_start, profiles!inner(display_name, username, country)")
    .order("xp", { ascending: false })
    .order("updated_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const leagues = LEAGUE_TIERS.map((t) => {
    const tierMembers = (members ?? []).filter((m: any) => m.tier === t.tier);
    const ranked = tierMembers
      .filter((m: any) => m.week_start === week)
      .map((m: any) => ({
        userId: m.user_id,
        name: m.profiles?.display_name || m.profiles?.username || "Player",
        country: m.profiles?.country ?? null,
        xp: m.xp ?? 0,
      }))
      .sort((a: any, b: any) => b.xp - a.xp)
      .slice(0, 5);
    return {
      tier: t.tier,
      name: t.name,
      emoji: t.emoji,
      ratingBand: t.ratingBand,
      players: tierMembers.length,
      activeThisWeek: tierMembers.filter((m: any) => m.week_start === week).length,
      rewards: cfg.rewards_enabled ? rewardsForTier(cfg, t.tier) : [0, 0, 0, 0, 0],
      monthlyRewards: cfg.monthly_rewards_enabled !== false && cfg.rewards_enabled
        ? monthlyRewardsForTier(cfg, t.tier)
        : [0, 0, 0, 0, 0],
      top: ranked,
    };
  });

  return NextResponse.json({ week, leagues, rewardsCurrency: rewardsCurrency(cfg) });
}
