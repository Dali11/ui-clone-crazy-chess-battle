import type { Metadata } from "next";
import CommunityClient from "./community-client";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Community — Crazy Chess Battles Malawi",
  description: "The official Crazy Chess Battles community room. Chat with players, share strategies, and stay in the loop.",
  path: "/community",
});

export default function CommunityPage() {
  return <CommunityClient />;
}
