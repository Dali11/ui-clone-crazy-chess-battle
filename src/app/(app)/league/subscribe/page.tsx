import type { Metadata } from "next";
import SubscribeClient from "./subscribe-client";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "League Membership — Subscribe",
  description: "Subscribe to Crazy Chess Battles league membership for premium tournaments and features.",
  path: "/league/subscribe"
});

export default function SubscribePage() {
  return <SubscribeClient />;
}
