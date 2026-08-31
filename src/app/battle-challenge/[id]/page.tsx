import type { Metadata } from "next";

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import BattleChallengeAccept from "./battle-challenge-accept";
import { moneySymbol } from "@/lib/geo/format";
import ChallengeTaken from "@/app/challenge/[id]/challenge-taken";
import BattleChallengeWaiting from "./battle-challenge-waiting";

function formatMKK(amount: number, sym = "MK"): string {
  return `${sym} ${Math.floor(amount).toLocaleString("en-US")}`;
}


import { pageMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return pageMetadata({
    title: "Battle Challenge — Join the Chess Battle",
    description: "You've been invited to a chess battle on Crazy Chess Battles. Accept the challenge and compete for victory.",
    path: `/battle-challenge/${id}`,
  });
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

  let user: { id: string; email?: string | null } | null = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data?.user ?? null;
  } catch {
    // Corrupted/expired session — send to login instead of crashing
  }

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
  // Fetch challenger's country for currency display
  const { data: challengerProfile } = await admin
    .from("profiles")
    .select("country")
    .eq("id", challenge.challenger_id)
    .single();
  const _sym = moneySymbol(challengerProfile?.country);

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
    // If the challenger is viewing their own expired challenge, show refund info
    if (challenge.challenger_id === user.id) {
      return (
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <div className="card max-w-md w-full text-center space-y-3">
            <h1 className="text-2xl font-bold">Challenge {challenge.status === "expired" ? "Expired" : "Cancelled"}</h1>
            <p className="text-ccb-muted">
              {challenge.status === "expired"
                ? "Your challenge was not accepted in time. Your stake has been refunded to your wallet."
                : "This challenge was cancelled."}
            </p>
            <a href="/wallet" className="btn-primary inline-block mr-2">View Wallet</a>
            <a href="/battles" className="btn-secondary inline-block">Back to Battles</a>
          </div>
        </div>
      );
    }
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
        stakeLabel={formatMKK(challenge.stake, _sym)}
        expiresAt={challenge.expires_at}
      />
    );
  }

  if (new Date(challenge.expires_at) < new Date() && challenge.status === "pending") {
    // Challenge has expired — refund the escrowed stake server-side
    // ATOMIC CLAIM: only refund if we successfully claim this row
    // Prevents double-refunds when cron or refund-expired API fires simultaneously
    const { data: claimed } = await admin
      .from("battle_challenges")
      .update({ status: "expired" })
      .eq("id", id)
      .eq("status", "pending")
      .select("id, challenger_id, stake")
      .single();

    if (claimed) {
      const { error: creditErr } = await admin.rpc("credit_wallet", {
        p_user_id: claimed.challenger_id,
        p_amount: claimed.stake,
      });

      if (!creditErr) {
        await admin.from("deposits").insert({
          user_id: claimed.challenger_id,
          amount: claimed.stake,
          status: "success",
          method: "battle_refund",
          reference: `expired_challenge:${id}`,
        });
      } else {
        // Refund failed — revert status so cron can retry
        await admin
          .from("battle_challenges")
          .update({ status: "pending" })
          .eq("id", id);
      }
    }
    // If not claimed, another path already handled the refund

    // If the current user is the challenger, show refund confirmation
    if (challenge.challenger_id === user.id) {
      return (
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <div className="card max-w-md w-full text-center space-y-3">
            <h1 className="text-2xl font-bold">Challenge Expired</h1>
            <p className="text-ccb-muted">
              Your challenge was not accepted in time. Your stake of{" "}
              <span className="font-semibold text-ccb-text">{formatMKK(challenge.stake, _sym)}</span>{" "}
              has been refunded to your wallet.
            </p>
            <a href="/wallet" className="btn-primary inline-block mr-2">View Wallet</a>
            <a href="/battles" className="btn-secondary inline-block">Back to Battles</a>
          </div>
        </div>
      );
    }

    // Non-challenger visitor
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
    .select("wallet_balance, email, phone")
    .eq("id", user.id)
    .single();

  const { data: configRow } = await admin.from("battle_config").select("platform_fee_pct").limit(1).single();
  const feePct = configRow?.platform_fee_pct ?? 10;

  return (
    <BattleChallengeAccept
      challengeId={id}
      challengerName={challengerProfile?.display_name || challengerProfile?.username || "Player"}
      challengerRating={challengerProfile?.rating || 1200}
      stake={challenge.stake}
      timeControl={challenge.time_control || "rapid15"}
      feePct={feePct}
      initialBalance={myProfile?.wallet_balance ?? 0}
      email={myProfile?.email || user.email || ""}
      phone={myProfile?.phone || ""}
    />
  );
}
