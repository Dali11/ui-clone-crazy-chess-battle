import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRIZE_SPLITS_BY_TYPE, DEFAULT_PRIZE_SPLITS } from "@/lib/tournament/prizes";
import { getPlatformConfig } from "@/lib/platform-config";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      name, description, type = "swiss", timeControl = "blitz",
      initialMinutes = 5, incrementSeconds = 0, maxPlayers, minPlayers = 2,
      rounds, durationMinutes, startsAt, endsAt,
      entryFeeCents = 0, creatorProfitPercent = 0, minRating = 0, maxRating,
    } = body;

    if (!name || !startsAt) {
      return NextResponse.json({ error: "Tournament name and start time are required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // ─── Load platform config ──────────────────────────────────────────
    const tConfig = await getPlatformConfig(admin, "tournaments");

    // Enforce max players limit from platform settings
    const configMaxPlayers = tConfig.max_players || 128;
    const minP = Number(minPlayers) || 2;
    const maxP = maxPlayers ? Math.min(Number(maxPlayers), configMaxPlayers) : configMaxPlayers;

    if (minP < 2) {
      return NextResponse.json({ error: "Minimum 2 players required" }, { status: 400 });
    }
    if (maxP < minP) {
      return NextResponse.json({ error: "Max players must be greater than or equal to min players" }, { status: 400 });
    }

    const profitPercent = Math.max(0, Math.min(100, Number(creatorProfitPercent) || 0));
    const isPaid = Number(entryFeeCents) > 0;

    const dbType = ["arena", "swiss", "knockout"].includes(type) ? type : "swiss";
    const GAME_TIME_CONTROL_MAP: Record<string, string> = {
      bullet: "bullet", blitz3: "blitz", blitz: "blitz",
      rapid: "rapid", rapid15: "rapid", classical: "classical",
    };
    const dbTimeControl = GAME_TIME_CONTROL_MAP[timeControl] || "blitz";
    const payouts = PRIZE_SPLITS_BY_TYPE[dbType] || DEFAULT_PRIZE_SPLITS;

    // Check if creator is admin
    const { data: creatorProfile } = await admin
      .from("profiles").select("is_admin").eq("id", user.id).single();
    const isCreatorAdmin = creatorProfile?.is_admin ?? false;

    // Determine approval status based on platform settings
    const requireApproval = tConfig.require_approval !== false;
    const autoApproveUnder = tConfig.auto_approve_below_players || 0;

    let initialStatus: string;
    if (isCreatorAdmin) {
      initialStatus = "upcoming";
    } else if (requireApproval && !(autoApproveUnder > 0 && maxP <= autoApproveUnder)) {
      initialStatus = "pending_approval";
    } else {
      initialStatus = "upcoming";
    }

    const { data: tournament, error } = await admin
      .from("tournaments")
      .insert({
        name, description: description || null,
        type: dbType, time_control: dbTimeControl,
        initial_minutes: Number(initialMinutes), increment_seconds: Number(incrementSeconds || 0),
        max_players: maxP, min_players: minP,
        rounds: rounds ? Number(rounds) : null,
        duration_minutes: durationMinutes ? Number(durationMinutes) : null,
        starts_at: startsAt, ends_at: endsAt || null,
        entry_fee_cents: Number(entryFeeCents || 0),
        prize_pool_cents: isPaid ? 0 : Number(entryFeeCents || 0),
        creator_profit_percent: isPaid ? profitPercent : 0,
        prize_distribution: { type: "percentage", payouts },
        min_rating: Number(minRating || 0),
        max_rating: maxRating ? Number(maxRating) : null,
        created_by: user.id,
        status: initialStatus,
      })
      .select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      tournament,
      pendingApproval: initialStatus === "pending_approval",
      message: initialStatus === "pending_approval"
        ? "Tournament created! It's pending admin approval. You'll be notified once it's approved."
        : undefined,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to create tournament" }, { status: 500 });
  }
}
