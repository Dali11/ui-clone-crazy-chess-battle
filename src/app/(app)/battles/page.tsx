import type { Metadata } from "next";
import BattlesClient from "./battles-client";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Chess Battles — Wager & Win",
  description: "Challenge other players to chess battles with stakes. Wager and win in competitive chess matches on Crazy Chess Battles.",
  path: "/battles",
});

export default function BattlesPage() {
  return <BattlesClient />;
}
