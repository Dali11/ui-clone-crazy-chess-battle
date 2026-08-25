import type { Metadata } from "next";
import DraughtsClient from "./draughts-client";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "International Checkers — Play 10x10 Draughts Online",
  description: "Play International Checkers (10x10 draughts) online against players worldwide. Challenge friends and compete in ranked draughts games.",
  path: "/draughts",
});

export default function DraughtsPage() {
  return <DraughtsClient />;
}
