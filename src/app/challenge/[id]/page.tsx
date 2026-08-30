import type { Metadata } from "next";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import ChallengeAccept from "./challenge-accept";
import ChallengeTaken from "./challenge-taken";
import ChallengeWaiting from "./challenge-waiting";


import { pageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return pageMetadata({
    title: "Chess Challenge — Join the Battle",
    description: "You've been challenged to a chess battle on Crazy Chess Battles. Accept the challenge and start playing now.",
    path: `/challenge/${id}`,
  });
}

export default async function ChallengePage({
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

  let user: { id: string } | null = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data?.user ?? null;
  } catch {
    // Corrupted/expired session — send to login instead of crashing
  }

  // If not logged in, redirect to login with return path
  if (!user) {
    // Preserve ref code in the redirect chain
    const refParam = refCode ? `&ref=${refCode}` : "";
    redirect(`/login?redirect=/challenge/${id}${refParam}`);
  }

  // Fetch challenge
  const { data: challenge, error } = await admin
    .from("challenges")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !challenge) {
    notFound();
  }

  // If already accepted and game exists, check if the game is still in progress
  if (challenge.status === "accepted" && challenge.game_id) {
    // Fetch the game to check its status
    const { data: game } = await admin
      .from("games")
      .select("status, white_player_id, black_player_id")
      .eq("id", challenge.game_id)
      .single();

    // If the current user is a player in the game, send them straight to it
    if (game && (game.white_player_id === user.id || game.black_player_id === user.id)) {
      redirect(`/game/${challenge.game_id}`);
    }

    // If the game is still in progress, show the "taken" view with options
    if (game && game.status === "playing") {
      // Fetch both player profiles for display
      const { data: whiteProfile } = await admin
        .from("profiles")
        .select("username, display_name")
        .eq("id", game.white_player_id)
        .single();
      const { data: blackProfile } = await admin
        .from("profiles")
        .select("username, display_name")
        .eq("id", game.black_player_id)
        .single();

      return (
        <ChallengeTaken
          gameId={challenge.game_id}
          challengerName={whiteProfile?.display_name || whiteProfile?.username || "Player 1"}
          acceptorName={blackProfile?.display_name || blackProfile?.username || "Player 2"}
          timeControl={`${challenge.initial_minutes}+${challenge.increment_seconds}`}
        />
      );
    }

    // Game is finished — fall through to expired/unavailable view
  }

  if (challenge.status === "expired" || challenge.status === "cancelled") {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="card max-w-md w-full text-center space-y-3">
          <h1 className="text-2xl font-bold">Challenge Unavailable</h1>
          <p className="text-ccb-muted">
            This challenge has been {challenge.status}.
          </p>
          <a href="/play" className="btn-primary inline-block">Back to Play</a>
        </div>
      </div>
    );
  }

  // If user is the challenger, show waiting screen
  if (challenge.challenger_id === user.id) {
    const challengeUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://crazychessbattles.live"}/challenge/${id}`;
    return <ChallengeWaiting url={challengeUrl} challengeId={id} expiresAt={challenge.expires_at} />;
  }

  // Check expiry
  if (new Date(challenge.expires_at) < new Date()) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="card max-w-md w-full text-center space-y-3">
          <h1 className="text-2xl font-bold">Challenge Expired</h1>
          <p className="text-ccb-muted">This challenge is no longer available.</p>
          <a href="/play" className="btn-primary inline-block">Back to Play</a>
        </div>
      </div>
    );
  }

  // Fetch challenger profile
  const { data: challengerProfile } = await admin
    .from("profiles")
    .select("username, display_name, rating, avatar_url")
    .eq("id", challenge.challenger_id)
    .single();

  // Show accept screen
  return (
    <ChallengeAccept
      challengeId={id}
      challengerName={challengerProfile?.display_name || challengerProfile?.username || "Player"}
      challengerRating={challengerProfile?.rating || 1200}
      timeControl={`${challenge.initial_minutes}+${challenge.increment_seconds}`}
      rated={challenge.rated}
    />
  );
}
