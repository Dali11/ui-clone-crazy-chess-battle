import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Auto-allocates a player into the league that matches their rating range.
 * Called during the free registration phase (before leagues go premium).
 *
 * If the player already has a registration, returns the existing league.
 * If no rating is available, defaults to Open League (0-799).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();

    // Get player's rating
    const { data: profile } = await admin
      .from("profiles")
      .select("id, rating, username")
      .eq("id", user.id)
      .single();

    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

    const rating = profile.rating || 0;

    // Check if already registered for any league
    const { data: existing } = await admin
      .from("league_registrations")
      .select("id, league_id, status")
      .eq("player_id", user.id)
      .limit(1);

    if (existing && existing.length > 0) {
      const { data: league } = await admin
        .from("premier_leagues")
        .select("id, name, tier, min_rating, max_rating")
        .eq("id", existing[0].league_id)
        .single();

      return NextResponse.json({
        alreadyRegistered: true,
        league: league,
      });
    }

    // Find leagues open for registration
    const { data: leagues } = await admin
      .from("premier_leagues")
      .select("id, name, tier, min_rating, max_rating, status")
      .eq("status", "registration")
      .order("tier", { ascending: true });

    if (!leagues || leagues.length === 0) {
      return NextResponse.json({ error: "No leagues open for registration" }, { status: 400 });
    }

    // Match rating to league range (tiers ordered low→high)
    let matchedLeague = null;
    for (const league of leagues) {
      const min = league.min_rating || 0;
      const max = league.max_rating || 9999;
      if (rating >= min && rating <= max) {
        matchedLeague = league;
        break;
      }
    }

    // Fallback: Open League (lowest tier, last in the ordered list since tier 5 is highest)
    if (!matchedLeague) {
      matchedLeague = leagues[0]; // Open League (tier 5, lowest)
    }

    // Auto-register the player (status: approved since it's free phase)
    const { data: registration, error: regErr } = await admin
      .from("league_registrations")
      .insert({
        player_id: user.id,
        league_id: matchedLeague.id,
        status: "approved",
        qualified: true,
        qualification_reason: "auto_assigned_by_rating",
        registered_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (regErr) {
      // Check if it's a duplicate (already registered)
      if (regErr.code === "23505") {
        return NextResponse.json({ alreadyRegistered: true, league: matchedLeague });
      }
      console.error("[auto-allocate] registration error:", regErr.message);
      return NextResponse.json({ error: "Failed to register" }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      league: matchedLeague,
      registrationId: registration?.id,
      rating: rating,
    });
  } catch (err: any) {
    console.error("[auto-allocate] error:", err?.message);
    return NextResponse.json({ error: "Failed to auto-allocate" }, { status: 500 });
  }
}
