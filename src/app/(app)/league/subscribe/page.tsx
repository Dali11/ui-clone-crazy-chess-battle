import type { Metadata } from "next";
import SubscribeClient from "./subscribe-client";

export const metadata: Metadata = {
  title: "Membership — Subscribe to Crazy Chess Battles",
  description: "Subscribe to Crazy Chess Battles for premium tournament access, exclusive leagues, and enhanced features. Flexible membership plans available.",
  alternates: { canonical: "https://crazychessbattles.live/league/subscribe" },
};

export default function SubscribePage() {
  return <SubscribeClient />;
}
