import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import DraughtsGameClient from "@/components/game/draughts-game-client";

export const dynamic = "force-dynamic";

export default async function DraughtsGamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return notFound();

  const { data: game, error } = await supabase
    .from("draughts_games")
    .select("id, white_player_id, black_player_id, white_rating, black_rating, white_rating_change, black_rating_change, board_state, move_history, turn, status, winner, move_count, moves_since_capture, must_continue_jump, white_clock_ms, black_clock_ms, last_move_at, time_control, initial_minutes, increment_seconds, rated, created_at, variant")
    .eq("id", id)
    .single();

  if (error || !game) return notFound();

  // Get player profiles for names + avatars (mirrors chess game page)
  const [whiteProfile, blackProfile] = await Promise.all([
    supabase.from("profiles").select("username, display_name, avatar_url").eq("id", game.white_player_id).single(),
    supabase.from("profiles").select("username, display_name, avatar_url").eq("id", game.black_player_id).single(),
  ]);

  return (
    <DraughtsGameClient
      game={game}
      myId={user.id}
      whiteName={whiteProfile.data?.display_name || whiteProfile.data?.username || "White"}
      blackName={blackProfile.data?.display_name || blackProfile.data?.username || "Black"}
      whiteAvatar={whiteProfile.data?.avatar_url}
      blackAvatar={blackProfile.data?.avatar_url}
    />
  );
}
