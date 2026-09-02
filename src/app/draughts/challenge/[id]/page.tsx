import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return pageMetadata({
    title: "Draughts Challenge — Join the Game",
    description: "You've been challenged to a game of International Checkers on Crazy Chess Battles. Accept and play now.",
    path: `/draughts/challenge/${id}`,
  });
}

import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import DraughtsChallengeAccept from "./draughts-challenge-accept";
import DraughtsChallengeWaiting from "./draughts-challenge-waiting";
import DraughtsChallengeTaken from "./draughts-challenge-taken";
import DraughtsChallengeFinished from "./draughts-challenge-finished";

export default async function DraughtsChallengePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const refCode = typeof sp.ref === "string" ? sp.ref : null;
  const supabase = await createClient();
  const admin = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    const refParam = refCode ? `&ref=${refCode}` : "";
    redirect(`/login?redirect=/draughts/challenge/${id}${refParam}`);
  }

  const { data: challenge, error } = await admin
    .from("draughts_challenges")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !challenge) notFound();

  // Already accepted — redirect to game if player is in it
  if (challenge.status === "accepted" && challenge.game_id) {
    const { data: game } = await admin
      .from("draughts_games")
      .select("status, winner, move_count, white_player_id, black_player_id")
      .eq("id", challenge.game_id)
      .single();

    if (game && (game.white_player_id === user.id || game.black_player_id === user.id)) {
      redirect(`/draughts/game/${challenge.game_id}`);
    }

    if (game) {
      const { data: whiteProfile } = await admin
        .from("profiles")
        .select("username, display_name, draughts_rating, avatar_url")
        .eq("id", game.white_player_id)
        .single();
      const { data: blackProfile } = await admin
        .from("profiles")
        .select("username, display_name, draughts_rating, avatar_url")
        .eq("id", game.black_player_id)
        .single();

      const white = {
        name: whiteProfile?.display_name || whiteProfile?.username || "Player 1",
        avatarUrl: whiteProfile?.avatar_url || null,
        rating: whiteProfile?.draughts_rating || null,
      };
      const black = {
        name: blackProfile?.display_name || blackProfile?.username || "Player 2",
        avatarUrl: blackProfile?.avatar_url || null,
        rating: blackProfile?.draughts_rating || null,
      };
      const timeControl = `${challenge.initial_minutes}+${challenge.increment_seconds}`;

      if (game.status === "playing") {
        return (
          <DraughtsChallengeTaken
            gameId={challenge.game_id}
            white={white}
            black={black}
            timeControl={timeControl}
            moveCount={game.move_count || 0}
          />
        );
      }

      return (
        <DraughtsChallengeFinished
          gameId={challenge.game_id}
          white={white}
          black={black}
          winnerSide={game.winner as "white" | "black" | null}
          status={game.status}
          timeControl={timeControl}
        />
      );
    }
  }

  if (challenge.status === "expired" || challenge.status === "cancelled") {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="card max-w-md w-full text-center space-y-3">
          <h1 className="text-2xl font-bold">Challenge Unavailable</h1>
          <p className="text-ccb-muted">This challenge has been {challenge.status}.</p>
          <a href="/draughts" className="btn-primary inline-block">Back to Draughts</a>
        </div>
      </div>
    );
  }

  // Challenger sees waiting screen
  if (challenge.challenger_id === user.id) {
    const challengeUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://crazychessbattles.live"}/draughts/challenge/${id}`;
    return <DraughtsChallengeWaiting url={challengeUrl} challengeId={id} expiresAt={challenge.expires_at} />;
  }

  // Check expiry
  if (new Date(challenge.expires_at) < new Date()) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="card max-w-md w-full text-center space-y-3">
          <h1 className="text-2xl font-bold">Challenge Expired</h1>
          <p className="text-ccb-muted">This challenge is no longer available.</p>
          <a href="/draughts" className="btn-primary inline-block">Back to Draughts</a>
        </div>
      </div>
    );
  }

  // Show accept screen
  const { data: challengerProfile } = await admin
    .from("profiles")
    .select("username, display_name, draughts_rating")
    .eq("id", challenge.challenger_id)
    .single();

  return (
    <DraughtsChallengeAccept
      challengeId={id}
      challengerName={challengerProfile?.display_name || challengerProfile?.username || "Player"}
      challengerRating={challengerProfile?.draughts_rating || 1500}
      timeControl={`${challenge.initial_minutes}+${challenge.increment_seconds}`}
      rated={challenge.rated}
    />
  );
}
