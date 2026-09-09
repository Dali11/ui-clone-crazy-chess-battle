import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTimeoutForGame } from "@/lib/game/resolve-timeout";
import { getAbortSeconds, REPLY_ABORT_SECONDS } from "@/lib/game/abort-config";
import { resolveDraughtsTimeout, abortDraughtsNoShow, DRAUGHTS_NO_SHOW_SECONDS } from "@/lib/game/draughts-timeout";

// Cron sweep — checks ALL active games for:
//   1. Early-move no-show (moves 0 and 1): mirrors the "must move" countdown
//      in the UI. Casual games abort, battles resolve decisively.
//   2. Expired clocks.
// Runs every minute via Vercel cron (see vercel.json) so games resolve
// chess.com-style even when neither player has a tab open — previously
// enforcement depended entirely on a connected browser polling
// /api/game/timeout-check, so a dead game just sat there forever.
// Tournament games are excluded from the no-show rule here: the tournament
// cron enforces its own 2-minute auto-resign (plus bracket advancement).
// Requires CRON_SECRET.
async function handleSweep(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: activeGames } = await admin
      .from("games")
      .select("id, turn, move_count, white_clock_ms, black_clock_ms, last_move_at, created_at, white_player_id, black_player_id, white_rating, black_rating, rated, tournament_id, time_control")
      .eq("status", "playing");

    if (!activeGames || activeGames.length === 0) {
      return NextResponse.json({ checked: 0, timedOut: 0, aborted: 0 });
    }

    const now = Date.now();
    let timedOut = 0;
    let aborted = 0;

    for (const game of activeGames) {
      // ── Early-move no-show check (moves 0 and 1) ────────────────────
      if ((game.move_count === 0 || game.move_count === 1) && !game.tournament_id) {
        const thresholdSec =
          game.move_count === 0 ? getAbortSeconds(game.time_control) : REPLY_ABORT_SECONDS;
        const timerStart = new Date(game.last_move_at || game.created_at).getTime();
        const elapsedMs = now - timerStart;

        if (elapsedMs >= thresholdSec * 1000) {
          // Battles always resolve decisively — never abort with money in escrow
          const { data: battle } = await admin
            .from("battles")
            .select("id")
            .or(`game_id.eq.${game.id},armageddon_game_id.eq.${game.id}`)
            .in("status", ["playing", "draw_armageddon"])
            .limit(1)
            .maybeSingle();

          if (battle) {
            await resolveTimeoutForGame(admin, game);
            timedOut++;
            continue;
          }

          // Casual game: abort with no winner and no rating change.
          // Atomic claim so this sweep can't race a player's timeout-check.
          const { data: claimed } = await admin
            .from("games")
            .update({
              status: "abort",
              winner: null,
              ended_at: new Date().toISOString(),
            })
            .eq("id", game.id)
            .eq("status", "playing")
            .select("id")
            .maybeSingle();

          if (claimed) aborted++;
          continue;
        }
      }

      // ── Clock expiry check ───────────────────────────────────────────
      // Clock starts as soon as the game transitions to "playing" (last_move_at
      // is set at that moment). No special-casing for move_count === 0.
      const lastMoveTime = new Date(game.last_move_at || game.created_at).getTime();
      const elapsedMs = now - lastMoveTime;
      const currentClockMs = game.turn === "white" ? game.white_clock_ms : game.black_clock_ms;
      const remainingMs = (currentClockMs ?? 0) - elapsedMs;

      if (remainingMs <= 0) {
        await resolveTimeoutForGame(admin, game);
        timedOut++;
      }
    }

    // ── DRAUGHTS SWEEP ────────────────────────────────────────────────
    // draughts_games previously had NO timeout enforcement at all — only a
    // self-check when the mover submitted a move, so a player who never
    // moved left the game "playing" forever. All draughts games are casual
    // (no battles), so early no-shows abort and expired clocks resolve as
    // a decisive timeout loss with ELO update — same rules as chess.
    const { data: draughtsGames } = await admin
      .from("draughts_games")
      .select("id, turn, move_count, white_clock_ms, black_clock_ms, last_move_at, created_at, white_player_id, black_player_id, rated")
      .eq("status", "playing");

    let draughtsTimedOut = 0;
    let draughtsAborted = 0;

    for (const dg of draughtsGames || []) {
      const lastMoveTime = new Date(dg.last_move_at || dg.created_at).getTime();
      const elapsedMs = now - lastMoveTime;

      // Early-move no-show (moves 0-1)
      if ((dg.move_count === 0 || dg.move_count === 1) && elapsedMs >= DRAUGHTS_NO_SHOW_SECONDS * 1000) {
        const r = await abortDraughtsNoShow(admin, dg);
        if (r.status === "abort") draughtsAborted++;
        continue;
      }

      // Clock expiry — only meaningful once a move has been made (the
      // first draughts move starts the clock without consuming time).
      if (dg.move_count === 0) continue;
      const currentClockMs = dg.turn === "white" ? dg.white_clock_ms : dg.black_clock_ms;
      const remainingMs = (currentClockMs ?? 0) - elapsedMs;

      if (remainingMs <= 0) {
        const r = await resolveDraughtsTimeout(admin, dg);
        if (r.status === "timeout") draughtsTimedOut++;
      }
    }

    return NextResponse.json({
      checked: activeGames.length,
      timedOut,
      aborted,
      draughtsChecked: draughtsGames?.length ?? 0,
      draughtsTimedOut,
      draughtsAborted,
    });
  } catch (e: any) {
    console.error("Timeout check error:", e);
    return NextResponse.json({ error: "Timeout check failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return handleSweep(req);
}

export async function POST(req: NextRequest) {
  return handleSweep(req);
}
