import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import PageClient from "./page-client";

export const metadata = pageMetadata({
  title: "League Table — Standings & Rankings",
  description: "View the current league standings on Crazy Chess Battles. See rankings, points, and performance across all divisions.",
  path: "/league/table"
});

export default PageClient;
