import type { Metadata } from "next";
import TournamentsClient from "@/app/(app)/league/tournaments/tournaments-client";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Chess Tournaments — Browse & Enter Competitions",
  description: "Browse all active and upcoming chess tournaments on Crazy Chess Battles. Find open tournaments, check entry requirements, and register to compete for prizes.",
  path: "/tournaments",
});

export default function TournamentsPage() {
  return <TournamentsClient />;
}
