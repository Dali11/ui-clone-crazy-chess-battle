import type { Metadata } from "next";
import ForgotPasswordClient from "./forgot-password-client";

import { pageMetadata } from "@/lib/seo/metadata";

export const metadata = pageMetadata({
  title: "Forgot Password — Reset Access",
  description: "Reset your Crazy Chess Battles account password.",
  path: "/forgot-password",
  noIndex: true
});

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />;
}
