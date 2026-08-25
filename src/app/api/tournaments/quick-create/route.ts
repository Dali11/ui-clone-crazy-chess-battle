import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ccb-cron-secret-2026`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  const { data: tournament, error } = await admin
    .from("tournaments")
    .insert({
      name: "Tuesday Night Blitz",
      description: "Weekly community blitz tournament. 5 rounds, Swiss pairing, 5+0 time control.",
      type: "swiss",
      time_control: "blitz",
      initial_minutes: 5,
      increment_seconds: 0,
      max_players: 16,
      min_players: 2,
      rounds: 5,
      starts_at: "2026-08-25T18:30:00Z",
      entry_fee_cents: 0,
      prize_pool_cents: 0,
      creator_profit_percent: 0,
      prize_distribution: { type: "percentage", payouts: [{ place: 1, percent: 50 }, { place: 2, percent: 30 }, { place: 3, percent: 20 }] },
      min_rating: 0,
      status: "upcoming",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, tournament });
}
