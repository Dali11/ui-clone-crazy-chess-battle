import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// GET — returns tournaments eligible for popup display:
//   1. Created within the last 5 minutes (announce new tournament)
//   2. Starting within the next 1 hour (reminder before start)
// Only upcoming or active tournaments are included.
export async function GET() {
  try {
    const admin = createAdminClient();
    const now = new Date();

    // Window: created in last 5 min OR starts within next 1 hour
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000).toISOString();

    const { data: tournaments, error } = await admin
      .from("tournaments")
      .select("id, name, description, type, status, time_control, initial_minutes, increment_seconds, entry_fee, max_players, starts_at, created_at")
      .in("status", ["upcoming", "active"])
      .or(`and(created_at.gte.${fiveMinAgo}),and(starts_at.lte.${oneHourFromNow},starts_at.gte.${now.toISOString()})`)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Tag each tournament with the popup reason
    const result = (tournaments || []).map((t) => {
      const createdAt = new Date(t.created_at);
      const startsAt = t.starts_at ? new Date(t.starts_at) : null;
      const isRecent = createdAt >= new Date(fiveMinAgo);
      const isStartingSoon = startsAt && startsAt <= new Date(oneHourFromNow) && startsAt >= now;

      return {
        ...t,
        popup_reason: isRecent ? "new" : "starting_soon",
        minutes_until_start: startsAt ? Math.round((startsAt.getTime() - now.getTime()) / 60000) : null,
      };
    });

    return NextResponse.json({ tournaments: result });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
