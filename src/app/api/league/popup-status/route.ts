import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET — returns whether the league registration popup should be shown.
 *
 * Shows popup if:
 * 1. User is logged in
 * 2. Registration deadline (Sep 5, 2026) hasn't passed
 * 3. User hasn't registered for ANY league yet
 *
 * Dismissal cooldown (1 week) is tracked in localStorage on the client side.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ show: false });
    }

    // Registration deadline: September 5, 2026, 23:59 CAT (21:59 UTC)
    const deadline = new Date("2026-09-05T21:59:59Z");
    if (new Date() > deadline) {
      return NextResponse.json({ show: false, reason: "deadline_passed" });
    }

    const admin = createAdminClient();

    // Check if user has registered for any league
    const { data: registrations } = await admin
      .from("league_registrations")
      .select("id, league_id, status")
      .eq("player_id", user.id)
      .in("status", ["pending", "approved"])
      .limit(1);

    if (registrations && registrations.length > 0) {
      return NextResponse.json({ show: false, reason: "already_registered" });
    }

    // Check if user is already a player in any league
    const { data: leagues } = await admin
      .from("premier_leagues")
      .select("id, player_ids")
      .in("status", ["registration"]);

    const isInAnyLeague = (leagues || []).some((l: any) =>
      l.player_ids?.includes(user.id)
    );

    if (isInAnyLeague) {
      return NextResponse.json({ show: false, reason: "already_in_league" });
    }

    // Get user's rating to recommend a league
    const { data: profile } = await supabase
      .from("profiles")
      .select("rating, display_name")
      .eq("id", user.id)
      .single();

    const rating = profile?.rating || 0;
    let recommendedTier = 5;
    if (rating >= 2000) recommendedTier = 1;
    else if (rating >= 1600) recommendedTier = 2;
    else if (rating >= 1200) recommendedTier = 3;
    else if (rating >= 800) recommendedTier = 4;

    // Get all leagues in registration
    const { data: allLeagueData } = await admin
      .from("premier_leagues")
      .select("id, name, tier, min_rating, max_rating")
      .eq("status", "registration")
      .order("tier", { ascending: true });

    const allLeagues = allLeagueData || [];
    const recommended = allLeagues.find((l: any) => l.tier === recommendedTier);

    return NextResponse.json({
      show: true,
      recommended: recommended
        ? {
            id: recommended.id,
            name: recommended.name,
            tier: recommended.tier,
            minRating: recommended.min_rating || 0,
            maxRating: recommended.max_rating,
          }
        : null,
      leagues: allLeagues.map((l: any) => ({
        id: l.id,
        name: l.name,
        tier: l.tier,
        minRating: l.min_rating || 0,
        maxRating: l.max_rating,
      })),
      userRating: rating,
      deadline: "September 5, 2026",
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
