import type { Metadata } from "next";
import ResetPasswordClient from "./reset-password-client";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Reset Password — Set New Password",
  description: "Set a new password for your Crazy Chess Battles account.",
  path: "/reset-password",
  noIndex: true
});

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}
