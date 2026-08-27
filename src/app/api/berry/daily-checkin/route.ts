import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);

    // Check if already checked in today
    const { data: existing } = await admin
      .from("daily_checkins")
      .select("id")
      .eq("user_id", user.id)
      .eq("checkin_date", today)
      .single();

    if (existing) {
      return NextResponse.json({ error: "Already checked in today!", alreadyCheckedIn: true }, { status: 400 });
    }

    // Get berry config
    const { data: config } = await admin.from("berry_config").select("*").limit(1).single();
    if (!config?.enabled) {
      return NextResponse.json({ error: "Berry earning is disabled" }, { status: 400 });
    }

    // Get yesterday's streak
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const { data: yesterdayCheckin } = await admin
      .from("daily_checkins")
      .select("streak_count")
      .eq("user_id", user.id)
      .eq("checkin_date", yesterday)
      .single();

    const newStreak = (yesterdayCheckin?.streak_count || 0) + 1;

    // Calculate berries: base + streak bonus
    let berries = config.berry_daily_login || 5;

    let streakBonus = 0;
    if (newStreak === 3) streakBonus = config.berry_streak_3day || 5;
    else if (newStreak === 7) streakBonus = config.berry_streak_7day || 10;
    else if (newStreak === 14) streakBonus = config.berry_streak_14day || 20;
    else if (newStreak === 30) streakBonus = config.berry_streak_30day || 50;
    else if (newStreak > 30 && newStreak % 30 === 0) streakBonus = config.berry_streak_30day || 50;

    berries += streakBonus;

    // Create check-in record
    await admin.from("daily_checkins").insert({
      user_id: user.id,
      checkin_date: today,
      streak_count: newStreak,
      berries_awarded: berries,
    });

    // Award berries — base check-in
    const baseAmount = config.berry_daily_login || 5;
    await admin.rpc("credit_berries", {
      p_user_id: user.id,
      p_amount: baseAmount,
      p_description: `Daily check-in (${newStreak} day streak)`,
    });

    // Award streak bonus as a separate transaction (if applicable)
    if (streakBonus > 0) {
      await admin.rpc("credit_berries", {
        p_user_id: user.id,
        p_amount: streakBonus,
        p_description: `${newStreak}-day streak bonus!`,
      });
    }

    return NextResponse.json({
      success: true,
      berriesAwarded: berries,
      streak: newStreak,
      streakBonus,
      message: streakBonus > 0
        ? `+${berries} CCB! (${newStreak}-day streak 🔥 bonus +${streakBonus})`
        : `+${berries} CCB! (${newStreak}-day streak 🔥)`,
    });
  } catch (e: any) {
    console.error("Daily check-in error:", e);
    return NextResponse.json({ error: e.message || "Check-in failed" }, { status: 500 });
  }
}

// GET — fetch check-in status
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const today = new Date().toISOString().slice(0, 10);

    // Today's check-in
    const { data: todayCheckin } = await admin
      .from("daily_checkins")
      .select("*")
      .eq("user_id", user.id)
      .eq("checkin_date", today)
      .single();

    // Latest check-in (for current streak)
    const { data: latest } = await admin
      .from("daily_checkins")
      .select("streak_count, checkin_date")
      .eq("user_id", user.id)
      .order("checkin_date", { ascending: false })
      .limit(1)
      .single();

    // Check if streak is still active (last check-in was yesterday or today)
    let currentStreak = 0;
    if (todayCheckin) {
      currentStreak = todayCheckin.streak_count;
    } else if (latest) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (latest.checkin_date === yesterday) {
        currentStreak = latest.streak_count;
      }
    }

    // Get config for display
    const { data: config } = await admin.from("berry_config").select("berry_daily_login, berry_streak_3day, berry_streak_7day, berry_streak_14day, berry_streak_30day").limit(1).single();

    return NextResponse.json({
      checkedInToday: !!todayCheckin,
      currentStreak,
      todayBerries: todayCheckin?.berries_awarded || 0,
      config: config || {},
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
