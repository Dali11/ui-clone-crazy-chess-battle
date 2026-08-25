import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/metadata";
import PageClient from "./page-client";

export const metadata = pageMetadata({
  title: "League Notifications",
  description: "Stay updated with league notifications on Crazy Chess Battles.",
  path: "/league/notifications",
  noIndex: true
});

export default PageClient;
