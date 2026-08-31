import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRIZE_SPLITS_BY_TYPE } from "@/lib/tournament/prizes";
import { getPlatformConfig } from "@/lib/platform-config";

/**
 * Weekly tournament creator — creates ONE tournament per week on Mondays.
 * Rotates: Swiss → Knockout → Arena → repeat.
 * Entry fee: MK1000 (well within MK5000 max).
 *
 * Called by Vercel cron (Mondays at 00:00 UTC / 02:00 Blantyre).
 * Auth: CRON_SECRET header.
 */

const SYSTEM_ADMIN_ID = "2128390f-9724-44a7-86fe-014227be300e";

const ROTATION = ["swiss", "knockout", "arena"] as const;
const NAME_PREFIX: Record<string, string> = {
  swiss: "Swiss Masters",
  knockout: "Knockout Kings",
  arena: "Arena Rumble",
};

export async function POST(req: NextRequest) {
  return handleCreate(req);
}

export async function GET(req: NextRequest) {
  return handleCreate(req);
}

async function handleCreate(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Count existing upcoming tournaments to determine rotation position
    const { count } = await admin
      .from("tournaments")
      .select("id", { count: "exact", head: true })
      .eq("status", "upcoming")
      .gte("starts_at", new Date().toISOString());

    // The rotation index = count of upcoming tournaments
    const weekIndex = count || 0;
    const tType = ROTATION[weekIndex % 3];
    const tournamentName = `${NAME_PREFIX[tType]} ${weekIndex + 1}`;

    // Check if this tournament already exists
    const { data: existing } = await admin
      .from("tournaments")
      .select("id")
      .eq("name", tournamentName)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ skipped: true, reason: "Already exists" });
    }

    // Calculate start time: next Monday 20:00 Blantyre (18:00 UTC)
    const now = new Date();
    const daysUntilMonday = (1 - now.getUTCDay() + 7) % 7 || 7; // 1=Monday
    const startsAt = new Date(now);
    startsAt.setUTCDate(now.getUTCDate() + daysUntilMonday);
    startsAt.setUTCHours(18, 0, 0, 0);

    // ── Load tournament pricing from platform config ──────────────────
    const tConfig = await getPlatformConfig(admin, "tournaments");

    const tcTimeControl = tConfig.auto_create_time_control || "rapid";
    const tcInitialMinutes = Number(tConfig.auto_create_initial_minutes) || 10;
    const tcIncrementSeconds = Number(tConfig.auto_create_increment_seconds) || 5;
    const tcMaxPlayers = Number(tConfig.auto_create_max_players) || 128;
    const tcMinPlayers = Number(tConfig.auto_create_min_players) || 6;
    const tcEntryFee = Number(tConfig.default_entry_fee) || 1000;
    const tcCreatorProfit = Number(tConfig.auto_create_creator_profit_pct ?? tConfig.default_creator_profit_pct) ?? 10;

    const payouts = PRIZE_SPLITS_BY_TYPE[tType] || PRIZE_SPLITS_BY_TYPE["swiss"];

    const base: Record<string, any> = {
      name: tournamentName,
      description: `Weekly ${tType} tournament — ${tcTimeControl} ${tcInitialMinutes}+${tcIncrementSeconds}. ${tcEntryFee > 0 ? `${tcEntryFee} entry` : "Free entry"}. One tournament per week.`,
      type: tType,
      time_control: tcTimeControl,
      initial_minutes: tcInitialMinutes,
      increment_seconds: tcIncrementSeconds,
      max_players: tcMaxPlayers,
      min_players: tcMinPlayers,
      starts_at: startsAt.toISOString(),
      ends_at: null,
      entry_fee: tcEntryFee,
      prize_pool: 0,
      pool_source: "entry_fees",
      creator_profit_percent: tcCreatorProfit,
      prize_distribution: { type: "percentage", payouts },
      min_rating: 0,
      max_rating: null,
      thumbnail_url: null,
      knockout_format: "pure",
      created_by: SYSTEM_ADMIN_ID,
      status: "upcoming",
    };

    if (tType === "swiss") {
      base.rounds = 5;
    } else if (tType === "arena") {
      base.duration_minutes = 120;
      base.rounds = null;
    } else {
      base.rounds = null;
    }

    const { data: tournament, error } = await admin
      .from("tournaments")
      .insert(base)
      .select()
      .single();

    if (error) {
      console.error("Weekly tournament creation failed:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[weekly-tournament] Created "${tournamentName}" (${tType}) starting ${startsAt.toISOString()}`);

    return NextResponse.json({
      success: true,
      tournament,
      name: tournamentName,
      type: tType,
      startsAt: startsAt.toISOString(),
    });
  } catch (e: any) {
    console.error("Weekly tournament creation error:", e);
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
