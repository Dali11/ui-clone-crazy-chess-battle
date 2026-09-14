import type { Metadata } from "next";
import FriendsClient from "./friends-client";

export const metadata: Metadata = {
  title: "Friends — Crazy Chess Battles",
  description: "Your chess friends: one-tap challenges, chat and friendly games.",
  robots: { index: false, follow: true },
};

export default function FriendsPage() {
  return <FriendsClient />;
}
