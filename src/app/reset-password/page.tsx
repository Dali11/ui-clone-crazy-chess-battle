import type { Metadata } from "next";
import ResetPasswordClient from "./reset-password-client";

export const metadata: Metadata = {
  title: "Reset Password — Crazy Chess Battles",
};

export default function ResetPasswordPage() {
  return <ResetPasswordClient />;
}
