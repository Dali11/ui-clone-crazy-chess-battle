import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import PageClient from "./page-client";

export const metadata = pageMetadata({
  title: "League Dashboard — Your Season",
  description: "View your league dashboard on Crazy Chess Battles. Track your fixtures, standings, and progress.",
  path: "/league/dashboard"
});

export default PageClient;
