import type { Metadata } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import TournamentClient from "./tournament-client";

// TournamentClient reads ?action=join via useSearchParams to auto-complete
// a join after a logged-out visitor is bounced through Signup/Login and back.
// Force dynamic rendering so that works without a Suspense boundary.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: tournament } = await admin
    .from("tournaments")
    .select("name, type, time_control, status, starts_at, entry_fee, max_players")
    .eq("id", id)
    .single();

  if (!tournament) {
    return {
      title: "Tournament Not Found",
      robots: { index: false, follow: false },
    };
  }

  const title = `${tournament.name} — Crazy Chess Battles`;
  const statusText =
    tournament.status === "upcoming" ? "Upcoming" :
    tournament.status === "active" ? "Live Now" :
    tournament.status === "finished" ? "Results" : tournament.status;
  const description = `${statusText} ${tournament.time_control} chess tournament. ${tournament.type === "swiss" ? "Swiss-system" : tournament.type} format. ${tournament.entry_fee ? "Paid entry" : "Free entry"}. View participants, pairings, and results on Crazy Chess Battles.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      url: `https://crazychessbattles.live/tournament/${id}`,
      siteName: "Crazy Chess Battles",
      locale: "en_US",
      images: [{ url: "/og-image.png", width: 1200, height: 630, alt: tournament.name }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
    alternates: { canonical: `https://crazychessbattles.live/tournament/${id}` },
    robots: { index: true, follow: true },
  };
}

export default function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <TournamentClient params={params} />;
}
