import type { Metadata } from "next";
import SignupClient from "./signup-client";

import { pageMetadata } from "@/lib/seo/metadata";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerCurrency } from "@/lib/geo/server-currency";
import { headers } from "next/headers";

/**
 * Detect the currency of whoever is actually fetching this metadata —
 * WhatsApp/Facebook/etc. generate the link preview from the request that
 * hits this very page, which carries the OPENER's own IP (not the
 * challenger's saved profile country). Same header-then-IP-lookup chain
 * as detectCountryCode(), adapted for a context with no NextRequest.
 */
async function detectViewerCountry(): Promise<string> {
  const h = await headers();
  let cc = h.get("x-vercel-ip-country")?.toUpperCase() || "";

  if (!cc) {
    const forwarded = h.get("x-forwarded-for");
    if (forwarded) {
      const ip = forwarded.split(",")[0].trim();
      if (ip && !ip.startsWith("127.") && !ip.startsWith("10.") && !ip.startsWith("192.168.")) {
        try {
          const res = await fetch(`https://ipapi.co/${ip}/country/`, {
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) cc = (await res.text()).trim().toUpperCase();
        } catch {
          // Geolocation failed — fall through to the Malawi default below
        }
      }
    }
  }

  return cc && cc.length === 2 ? cc : "MW";
}

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
            .select("username, display_name")
            .eq("id", challenge.challenger_id)
            .single();

          const name = profile?.display_name || profile?.username || "A player";
          // Currency shown matches whoever is opening this link right now —
          // not the challenger's own country (that was the bug: a Zambian
          // challenger's stake showed "ZK" even to a Malawian opening it).
          const viewerCountry = await detectViewerCountry();
          const { formatMoney } = await getServerCurrency(viewerCountry);
          const stake = formatMoney(challenge.stake);

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
            .select("username, display_name")
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
    description: "Create your free Crazy Chess Battles account. Start playing competitive chess, join tournaments, and climb the league standings.",
    path: "/signup",
  });
}

export default function SignupPage() {
  return <SignupClient />;
}
