import type { Metadata } from "next";
import LoginClient from "./login-client";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Log In — Crazy Chess Battles",
  description: "Log in to your Crazy Chess Battles account to play chess, join tournaments, and track your ranking.",
  path: "/login",
});

export default function LoginPage() {
  return <LoginClient />;
}
