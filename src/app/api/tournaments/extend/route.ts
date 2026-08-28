import { NextResponse } from "next/server";
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (key !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { tournamentId, addMinutes } = body;
  if (!tournamentId || !addMinutes) {
    return NextResponse.json({ error: "Missing tournamentId or addMinutes" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const admin = createClient(supabaseUrl, serviceKey);

  // Get current tournament
  const { data: tournament, error: fetchError } = await admin
    .from("tournaments")
    .select("id, name, ends_at, duration_minutes, status")
    .eq("id", tournamentId)
    .single();

  if (fetchError || !tournament) {
    return NextResponse.json({ error: "Tournament not found" }, { status: 404 });
  }

  // Calculate new ends_at: extend from current ends_at (or from now if already passed)
  const currentEndsAt = tournament.ends_at ? new Date(tournament.ends_at) : new Date();
  const baseTime = currentEndsAt.getTime() > Date.now() ? currentEndsAt : new Date();
  const newEndsAt = new Date(baseTime.getTime() + addMinutes * 60 * 1000);
  const newDuration = (tournament.duration_minutes || 60) + addMinutes;

  const { error: updateError } = await admin
    .from("tournaments")
    .update({
      ends_at: newEndsAt.toISOString(),
      duration_minutes: newDuration,
    })
    .eq("id", tournamentId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    tournamentId,
    name: tournament.name,
    previousEndsAt: tournament.ends_at,
    newEndsAt: newEndsAt.toISOString(),
    newDurationMinutes: newDuration,
  });
}
