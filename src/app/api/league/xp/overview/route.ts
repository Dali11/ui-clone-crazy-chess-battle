import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  getLeagueXpConfig,
  currentMonthStart,
  nextMonthStart,
  monthlyRewardsForTier,
  levelFor,
} from "@/lib/league-xp";

export const dynamic = "force-dynamic";

/**
 * All-leagues overview for the League page "Overview" tab (owner
 * correction 2026-09-26: tiers MAINTAINED on the monthly cycle): for
 * each of the five tiers — roster size, monthly reward table, and the
 * top 5 players of the current month. Authenticated read-only.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const cfg = await getLeagueXpConfig(admin);
  const month = currentMonthStart();

  const { data: members, error } = await admin
    .from("league_xp_members")
    .select("user_id, tier, xp, week_start, profiles!inner(display_name, username, country, membership_until)")
    .order("xp", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rewardsOn = cfg.rewards_enabled && cfg.monthly_rewards_enabled !== false;

  const leagues = [1, 2, 3, 4, 5].map((t) => {
    const tierMembers = (members ?? []).filter((m: any) => m.tier === t);
    const ranked = tierMembers
      .filter((m: any) => m.week_start === month)
      .map((m: any) => ({
        userId: m.user_id,
        name: m.profiles?.display_name || m.profiles?.username || "Player",
        country: m.profiles?.country ?? null,
        isClub: levelFor(m.profiles?.membership_until) === "club",
        xp: Number(m.xp ?? 0),
      }))
      .sort((a: any, b: any) => b.xp - a.xp)
      .slice(0, 5);
    return {
      tier: t,
      name: ["Open League", "Amateur League", "Bronze League", "Knights Championship", "Premier League"][t - 1],
      emoji: ["🌱", "🥉", "🎯", "⚔️", "👑"][t - 1],
      ratingBand: ["Everyone starts here", "Developing players", "Intermediate players", "Advanced players", "The platform's best"][t - 1],
      players: tierMembers.length,
      activeThisMonth: tierMembers.filter((m: any) => m.week_start === month).length,
      // Cash-rewards pause (owner 2026-09-24): figures hidden while the
      // monthly kill-switch is off.
      rewards: rewardsOn ? monthlyRewardsForTier(cfg, t) : [0, 0, 0, 0, 0],
      top: ranked,
    };
  });

  return NextResponse.json({
    month,
    monthEnd: nextMonthStart(),
    leagues,
    rewardsPaused: cfg.monthly_rewards_enabled === false,
  });
}
