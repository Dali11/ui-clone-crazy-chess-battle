import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/games/[id]/broadcast   body: { broadcast: boolean }
 *
 * Free-play opt-in broadcasting: one of the two players flips their
 * live game public so it appears in the Live list. Only free-play
 * games are toggleable — tournament matches and staked battles are
 * always broadcast (public events / public money matches), so the
 * flag is meaningless there and the request is rejected.
 * Auth: must be a player of the game. Any signed-in user can watch
 * via the normal spectator flow; this endpoint only changes listing.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const broadcast = !!body.broadcast;

    const admin = createAdminClient();
    const { data: game, error } = await admin.from("games")
      .select("id, status, tournament_id, white_player_id, black_player_id")
      .eq("id", id)
      .single();
    if (error || !game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

    const isPlayer = user.id === game.white_player_id || user.id === game.black_player_id;
    if (!isPlayer) return NextResponse.json({ error: "Only players can change broadcast" }, { status: 403 });
    if (game.status !== "playing") {
      return NextResponse.json({ error: "Only in-progress games can be broadcast" }, { status: 400 });
    }
    if (game.tournament_id) {
      return NextResponse.json({ error: "Tournament matches are always broadcast" }, { status: 400 });
    }

    // Staked battles are always broadcast too — check via battles rows.
    const { data: battles } = await admin.from("battles")
      .select("id, stake")
      .or(`game_id.eq.${id},armageddon_game_id.eq.${id}`)
      .limit(1);
    if ((battles ?? []).length > 0) {
      return NextResponse.json({ error: "Staked battles are always broadcast" }, { status: 400 });
    }

    const { error: updateError } = await admin.from("games")
      .update({ broadcast })
      .eq("id", id);
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

    return NextResponse.json({ broadcast });
  } catch (err) {
    console.error("broadcast toggle error:", err);
    return NextResponse.json({ error: "Could not update broadcast" }, { status: 500 });
  }
}
