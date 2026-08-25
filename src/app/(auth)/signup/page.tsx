import type { Metadata } from "next";
import SignupClient from "./signup-client";

export const metadata: Metadata = {
  title: "Sign Up — Join Crazy Chess Battles",
  description: "Create your free Crazy Chess Battles account. Start playing competitive chess, join tournaments, and climb the global leaderboard.",
  alternates: { canonical: "https://crazychessbattles.live/signup" },
};

export default function SignupPage() {
  return <SignupClient />;
}
