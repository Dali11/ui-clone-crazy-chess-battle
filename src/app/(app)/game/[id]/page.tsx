import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import GameClientWrapper from "@/components/game/game-client-wrapper";
import type { GameState } from "@/hooks/use-realtime-game";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: game } = await supabase
    .from("games")
    .select("id, status, time_control, white_player:profiles!games_white_player_id_fkey(username, display_name), black_player:profiles!games_black_player_id_fkey(username, display_name)")
    .eq("id", id)
    .single();

  if (!game) {
    return { title: "Game Not Found", robots: { index: false, follow: false } };
  }

  const white = (game as any).white_player;
  const black = (game as any).black_player;
  const whiteName = white?.display_name || white?.username || "White";
  const blackName = black?.display_name || black?.username || "Black";

  const title = `${whiteName} vs ${blackName} — Live Chess Game`;
  const description = `Watch this ${game.time_control || "chess"} game between ${whiteName} and ${blackName}. Follow live moves and results on Crazy Chess Battles.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      url: `https://crazychessbattles.live/game/${id}`,
      siteName: "Crazy Chess Battles",
      locale: "en_US",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
    alternates: { canonical: `https://crazychessbattles.live/game/${id}` },
  };
}

export const dynamic = "force-dynamic";

export default async function GamePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const { data: game } = await supabase
    .from("games")
    .select("*")
    .eq("id", id)
    .single();

  if (!game) notFound();

  // Get player profiles for names
  const [whiteProfile, blackProfile] = await Promise.all([
    supabase.from("profiles").select("username, display_name, rating, avatar_url").eq("id", game.white_player_id).single(),
    supabase.from("profiles").select("username, display_name, rating, avatar_url").eq("id", game.black_player_id).single(),
  ]);

  const isPlayer = user && (user.id === game.white_player_id || user.id === game.black_player_id);
  const isSpectator = !isPlayer;

  // Check if this game is linked to a battle
  const { data: battle } = await supabase
    .from("battles")
    .select("id, stake_cents, winner_payout_cents, status, winner_id, white_player_id, black_player_id")
    .or(`game_id.eq.${id},armageddon_game_id.eq.${id}`)
    .limit(1)
    .single();

  const gameState: GameState = {
    id: game.id,
    fen: game.fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    pgn: game.pgn,
    turn: game.turn || "white",
    status: game.status,
    winner: game.winner,
    move_count: game.move_count || 0,
    white_clock_ms: game.white_clock_ms,
    black_clock_ms: game.black_clock_ms,
    last_move_at: game.last_move_at,
    white_player_id: game.white_player_id,
    black_player_id: game.black_player_id,
    white_rating: game.white_rating,
    black_rating: game.black_rating,
    white_rating_change: game.white_rating_change,
    black_rating_change: game.black_rating_change,
    time_control: game.time_control,
    initial_minutes: game.initial_minutes,
    increment_seconds: game.increment_seconds,
    rated: game.rated,
    created_at: game.created_at,
  };

  // Battle info for earnings display
  const battleInfo = battle ? {
    isBattle: true,
    stakeCents: battle.stake_cents,
    winnerPayoutCents: battle.winner_payout_cents,
    winnerId: battle.winner_id,
    isArmageddon: false, // will be determined in client
  } : null;

  return (
    <>
      <GameClientWrapper
        gameId={id}
        initialGame={gameState}
        currentUserId={user?.id || ""}
        isSpectator={isSpectator}
        whiteName={whiteProfile.data?.display_name || whiteProfile.data?.username || "White"}
        blackName={blackProfile.data?.display_name || blackProfile.data?.username || "Black"}
        whiteAvatar={whiteProfile.data?.avatar_url}
        blackAvatar={blackProfile.data?.avatar_url}
        battleInfo={battleInfo}
      />
    </>
  );
}
