import type { Metadata } from "next";
import SignupClient from "./signup-client";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Sign Up — Join Crazy Chess Battles",
  description: "Create your free Crazy Chess Battles account. Start playing competitive chess, join tournaments, and climb the global leaderboard.",
  path: "/signup",
});

export default function SignupPage() {
  return <SignupClient />;
}
