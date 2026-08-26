import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cron endpoint: starts all "waiting" tournament games whose scheduled_start time has passed.
 * Transitions games from "waiting" → "playing" and sets last_move_at = now (clock starts ticking).
 * All games in a round start simultaneously — no waiting for individual players.
 *
 * Call every 1 minute via cron-job.org or Vercel cron with CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  return handleStart(req);
}
export async function GET(req: NextRequest) {
  return handleStart(req);
}

async function handleStart(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    const now = new Date().toISOString();

    // Find all "waiting" games where scheduled_start has passed
    const { data: waitingGames, error } = await admin
      .from("games")
      .select("id, tournament_id, white_player_id, black_player_id, tournament_round")
      .eq("status", "waiting")
      .not("scheduled_start", "is", null)
      .lte("scheduled_start", now);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!waitingGames || waitingGames.length === 0) {
      return NextResponse.json({ started: 0, message: "No scheduled games to start" });
    }

    // Start all games simultaneously — set status to "playing" and last_move_at to now
    // The clock will start ticking from this moment (first move will deduct elapsed time)
    const gameIds = waitingGames.map((g) => g.id);

    const { error: updateError } = await admin
      .from("games")
      .update({
        status: "playing",
        last_move_at: now,
      })
      .in("id", gameIds);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Send "game_started" notifications to all players
    const tournamentIds = [...new Set(waitingGames.map((g) => g.tournament_id))];
    const { data: tournaments } = await admin
      .from("tournaments")
      .select("id, name")
      .in("id", tournamentIds);

    const tournamentMap = new Map((tournaments || []).map((t) => [t.id, t.name]));

    const notifications = waitingGames.flatMap((g) => [
      {
        user_id: g.white_player_id,
        type: "game_started",
        title: `Your game has started — ${tournamentMap.get(g.tournament_id) || "Tournament"}`,
        body: `Round ${g.tournament_round} has begun! Your clock is running. Make your move now.`,
        data: { gameId: g.id, tournamentId: g.tournament_id },
        read: false,
      },
      {
        user_id: g.black_player_id,
        type: "game_started",
        title: `Your game has started — ${tournamentMap.get(g.tournament_id) || "Tournament"}`,
        body: `Round ${g.tournament_round} has begun! Your clock is running. Make your move now.`,
        data: { gameId: g.id, tournamentId: g.tournament_id },
        read: false,
      },
    ]);

    // Insert notifications in bulk (ignore errors)
    if (notifications.length > 0) {
      await admin.from("notifications").insert(notifications).then(() => {}, () => {});
    }

    console.log(`[start-scheduled] Started ${gameIds.length} games at ${now}`);

    return NextResponse.json({
      started: gameIds.length,
      gameIds,
      timestamp: now,
    });
  } catch (e: any) {
    console.error("Start scheduled games error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
