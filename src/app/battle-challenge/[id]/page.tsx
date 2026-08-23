export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import BattleChallengeAccept from "./battle-challenge-accept";
import ChallengeTaken from "@/app/challenge/[id]/challenge-taken";
import BattleChallengeWaiting from "./battle-challenge-waiting";

function formatMKK(cents: number): string {
  return `MK ${Math.floor(cents / 100).toLocaleString("en-US")}`;
}

export default async function BattleChallengePage({
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?redirect=/battle-challenge/${id}${refCode ? `&ref=${refCode}` : ""}`);
  }

  const { data: challenge, error } = await admin
    .from("battle_challenges")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !challenge) {
    notFound();
  }

  // If already accepted and battle/game exists, check if the game is still in progress
  if (challenge.status === "accepted" && challenge.battle_id) {
    const { data: battle } = await admin
      .from("battles")
      .select("id, game_id, white_player_id, black_player_id")
      .eq("id", challenge.battle_id)
      .single();

    if (battle?.game_id) {
      // If the current user is a player in the battle, send them to the game
      if (battle.white_player_id === user.id || battle.black_player_id === user.id) {
        redirect(`/game/${battle.game_id}`);
      }

      // Check if the game is still in progress
      const { data: game } = await admin
        .from("games")
        .select("status, white_player_id, black_player_id")
        .eq("id", battle.game_id)
        .single();

      if (game && game.status === "playing") {
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
            gameId={battle.game_id}
            challengerName={whiteProfile?.display_name || whiteProfile?.username || "Player 1"}
            acceptorName={blackProfile?.display_name || blackProfile?.username || "Player 2"}
            timeControl="Battle"
          />
        );
      }
    }
  }

  if (challenge.status === "expired" || challenge.status === "cancelled") {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="card max-w-md w-full text-center space-y-3">
          <h1 className="text-2xl font-bold">Challenge Unavailable</h1>
          <p className="text-ccb-muted">This battle challenge has been {challenge.status}.</p>
          <a href="/battles" className="btn-primary inline-block">Back to Battles</a>
        </div>
      </div>
    );
  }

  // Challenger revisiting their own link → waiting screen
  if (challenge.challenger_id === user.id) {
    const url = `${process.env.NEXT_PUBLIC_SITE_URL || "https://crazychessbattles.live"}/battle-challenge/${id}`;
    return (
      <BattleChallengeWaiting
        challengeId={id}
        url={url}
        stakeLabel={formatMKK(challenge.stake_cents)}
        expiresAt={challenge.expires_at}
      />
    );
  }

  if (new Date(challenge.expires_at) < new Date()) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="card max-w-md w-full text-center space-y-3">
          <h1 className="text-2xl font-bold">Challenge Expired</h1>
          <p className="text-ccb-muted">This battle challenge is no longer available.</p>
          <a href="/battles" className="btn-primary inline-block">Back to Battles</a>
        </div>
      </div>
    );
  }

  const { data: challengerProfile } = await admin
    .from("profiles")
    .select("username, display_name, rating")
    .eq("id", challenge.challenger_id)
    .single();

  const { data: myProfile } = await admin
    .from("profiles")
    .select("wallet_balance_cents, email, phone")
    .eq("id", user.id)
    .single();

  const { data: configRow } = await admin.from("battle_config").select("platform_fee_pct").limit(1).single();
  const feePct = configRow?.platform_fee_pct ?? 10;

  return (
    <BattleChallengeAccept
      challengeId={id}
      challengerName={challengerProfile?.display_name || challengerProfile?.username || "Player"}
      challengerRating={challengerProfile?.rating || 1200}
      stakeCents={challenge.stake_cents}
      feePct={feePct}
      initialBalanceCents={myProfile?.wallet_balance_cents ?? 0}
      email={myProfile?.email || user.email || ""}
      phone={myProfile?.phone || ""}
    />
  );
}
