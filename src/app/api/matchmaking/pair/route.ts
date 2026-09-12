import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// This endpoint is called by Vercel Cron every 10 seconds
// It pairs players waiting in the matchmaking queue
export async function GET(req: NextRequest) {
  // Verify this is from Vercel Cron
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createAdminClient();

    // Clean up old entries (60s timeout)
    await supabase.rpc("cleanup_matchmaking");

    // Get all queue entries grouped by time_control + rated
    const { data: queue } = await supabase
      .from("matchmaking_queue")
      .select("id, player_id, time_control, rated, rating, joined_at")
      .order("joined_at", { ascending: true });

    if (!queue || queue.length < 2) {
      return NextResponse.json({ paired: 0 });
    }

    // Group by time_control + rated
    const groups: Record<string, typeof queue> = {};
    for (const entry of queue) {
      const key = `${entry.time_control}-${entry.rated}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    }

    let paired = 0;
    const tcConfig: Record<string, { minutes: number; increment: number }> = {
      bullet: { minutes: 1, increment: 0 },
      blitz: { minutes: 5, increment: 0 },
      blitz3: { minutes: 3, increment: 2 },
      rapid: { minutes: 10, increment: 0 },
      rapid15: { minutes: 15, increment: 10 },
      classical: { minutes: 30, increment: 0 },
    };

    for (const [key, entries] of Object.entries(groups)) {
      const [timeControl, ratedStr] = key.split("-");
      const rated = ratedStr === "true";
      const tc = tcConfig[timeControl] || tcConfig.blitz;

      // Pair players within this group
      const used = new Set<string>();
      for (let i = 0; i < entries.length; i++) {
        if (used.has(entries[i].id)) continue;

        let bestMatch = -1;
        let bestDiff = Infinity;
        for (let j = i + 1; j < entries.length; j++) {
          if (used.has(entries[j].id)) continue;
          const diff = Math.abs(entries[i].rating - entries[j].rating);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestMatch = j;
          }
        }

        if (bestMatch >= 0) {
          const white = entries[i];
          const black = entries[bestMatch];

          const { data: gameId } = await supabase.rpc("create_game", {
            p_white_id: white.player_id,
            p_black_id: black.player_id,
            p_white_rating: white.rating,
            p_black_rating: black.rating,
            p_time_control: timeControl,
            p_initial_minutes: tc.minutes,
            p_increment_seconds: tc.increment,
            p_rated: rated,
          });

          if (gameId) {
            await supabase.from("matchmaking_queue").delete().in("id", [white.id, black.id]);
            // They're matched — their auto-posted announce links are now stale.
            await supabase.from("challenges").update({ status: "cancelled" })
              .eq("source", "quick_match_announce")
              .eq("status", "pending")
              .in("challenger_id", [white.player_id, black.player_id]);
            paired++;
          }

          used.add(white.id);
          used.add(black.id);
        }
      }
    }

    return NextResponse.json({ paired });
  } catch (e) {
    return NextResponse.json({ error: "Pairing failed" }, { status: 500 });
  }
}
