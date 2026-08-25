import type { Metadata } from "next";
import LoginClient from "./login-client";

export const metadata: Metadata = {
  title: "Log In — Crazy Chess Battles",
  description: "Log in to your Crazy Chess Battles account to play chess, join tournaments, and track your ranking.",
  alternates: { canonical: "https://crazychessbattles.live/login" },
};

export default function LoginPage() {
  return <LoginClient />;
}
