import type { Metadata } from "next";
import PlayClient from "./play-client";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Play Chess Online — Live Games",
  description: "Play chess online against players worldwide. Choose from blitz, bullet, and rapid time controls. Find a match instantly on Crazy Chess Battles.",
  path: "/play",
});

export default function PlayPage() {
  return <PlayClient />;
}
