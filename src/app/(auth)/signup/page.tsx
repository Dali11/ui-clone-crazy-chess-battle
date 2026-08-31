import type { Metadata } from "next";
import SignupClient from "./signup-client";

import { pageMetadata } from "@/lib/seo/metadata";
import { createAdminClient } from "@/lib/supabase/admin";
import { moneySymbol } from "@/lib/geo/format";

const TC_LABELS: Record<string, string> = {
  bullet: "Bullet",
  blitz3: "Blitz",
  blitz: "Blitz",
  rapid: "Rapid",
  rapid15: "Rapid",
  classical: "Classical",
};

/**
 * Unauthenticated visitors hitting a protected route (/battle-challenge/:id,
 * /challenge/:id) get redirected here by middleware BEFORE that page's own
 * generateMetadata ever runs — which is exactly what link-preview crawlers
 * (WhatsApp, Facebook, Twitter/X, Slack) see when a challenge link is shared.
 * So the *shared link preview* copy has to live here, keyed off ?redirect=.
 */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const sp = await searchParams;
  const redirectTo = typeof sp.redirect === "string" ? sp.redirect : null;

  if (redirectTo) {
    const battleMatch = redirectTo.match(/^\/battle-challenge\/([a-f0-9-]+)/i);
    const friendMatch = redirectTo.match(/^\/challenge\/([a-f0-9-]+)/i);

    try {
      const admin = createAdminClient();

      if (battleMatch) {
        const { data: challenge } = await admin
          .from("battle_challenges")
          .select("challenger_id, stake, status")
          .eq("id", battleMatch[1])
          .single();

        if (challenge && challenge.status === "pending") {
          const { data: profile } = await admin
            .from("profiles")
            .select("username, display_name, country")
            .eq("id", challenge.challenger_id)
            .single();

          const name = profile?.display_name || profile?.username || "A player";
          const stake = `${moneySymbol(profile?.country)} ${Math.floor(challenge.stake).toLocaleString("en-US")}`;

          return pageMetadata({
            title: `⚔️ ${name} challenged you to a ${stake} chess battle!`,
            description: `Accept the challenge, stake ${stake}, and battle it out for the pot on Crazy Chess Battles. Sign up free to play.`,
            path: "/signup",
          });
        }
      }

      if (friendMatch) {
        const { data: challenge } = await admin
          .from("challenges")
          .select("challenger_id, time_control, status")
          .eq("id", friendMatch[1])
          .single();

        if (challenge && challenge.status === "pending") {
          const { data: profile } = await admin
            .from("profiles")
            .select("username, display_name, country")
            .eq("id", challenge.challenger_id)
            .single();

          const name = profile?.display_name || profile?.username || "A player";
          const tcLabel = TC_LABELS[challenge.time_control] || "Chess";

          return pageMetadata({
            title: `♟️ ${name} challenged you to a ${tcLabel} chess battle!`,
            description: `Accept the challenge and play a rated game on Crazy Chess Battles. Sign up free to play.`,
            path: "/signup",
          });
        }
      }
    } catch {
      // Fall through to default signup metadata below
    }
  }

  return pageMetadata({
    title: "Sign Up — Join Crazy Chess Battles",
    description: "Create your free Crazy Chess Battles account. Start playing competitive chess, join tournaments, and climb the global leaderboard.",
    path: "/signup",
  });
}

export default function SignupPage() {
  return <SignupClient />;
}
