import type { Metadata } from "next";
import ForgotPasswordClient from "./forgot-password-client";

export const metadata: Metadata = {
  title: "Forgot Password — Reset Your Account",
  description: "Reset your Crazy Chess Battles account password. Enter your email to receive a password reset link.",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordClient />;
}
