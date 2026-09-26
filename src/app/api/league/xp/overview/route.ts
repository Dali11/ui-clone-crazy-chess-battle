import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  getLeagueXpConfig,
  currentMonthStart,
  nextMonthStart,
  monthlyRewardArray,
  levelFor,
  XP_ALLOCATION,
} from "@/lib/league-xp";

export const dynamic = "force-dynamic";

/**
 * Monthly XP overview for the League page "Overview" tab (owner
 * redesign 2026-09-26): one board — roster size, club vs non-club
 * split, the monthly reward table, and the top 10 of the current
 * month. Authenticated read-only.
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
    .select("user_id, xp, week_start, lifetime_xp, profiles!inner(display_name, username, country, membership_until)")
    .order("xp", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const isClub = (m: any) => levelFor(m.profiles?.membership_until) === "club";
  const active = (members ?? []).filter((m: any) => m.week_start === month);

  const top = active
    .map((m: any) => ({
      userId: m.user_id,
      name: m.profiles?.display_name || m.profiles?.username || "Player",
      country: m.profiles?.country ?? null,
      isClub: isClub(m),
      xp: Number(m.xp ?? 0),
      lifetimeXp: Number(m.lifetime_xp ?? 0),
    }))
    .sort((a: any, b: any) => b.xp - a.xp)
    .slice(0, 10)
    .map((r: any, i: number) => ({ ...r, rank: i + 1 }));

  const rewardsOn = cfg.rewards_enabled && cfg.monthly_rewards_enabled !== false;

  return NextResponse.json({
    month,
    monthEnd: nextMonthStart(),
    totalPlayers: (members ?? []).length,
    activeThisMonth: active.length,
    clubPlayers: (members ?? []).filter(isClub).length,
    top,
    rewards: rewardsOn ? monthlyRewardArray(cfg) : [],
    rewardsPaused: cfg.monthly_rewards_enabled === false,
    xpRules: { allocation: XP_ALLOCATION, dailyCap: cfg.daily_xp_cap },
    topCount: cfg.monthly_top_count ?? 5,
  });
}
