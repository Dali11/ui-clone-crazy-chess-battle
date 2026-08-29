"use client";

import { useState } from "react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-ccb-primary flex items-center justify-center">
              <span className="text-white font-bold text-xl">♞</span>
            </div>
            <span className="text-lg font-bold">Crazy Chess Battles</span>
          </Link>
          <h1 className="text-2xl font-bold mt-4">Forgot Password</h1>
          <p className="text-sm text-ccb-muted mt-1">We&apos;ll send you a reset link</p>
        </div>

        {success ? (
          <div className="card text-center py-8">
            <div className="w-12 h-12 rounded-full bg-ccb-success/10 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-ccb-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="font-medium">Check your email</p>
            <p className="text-sm text-ccb-muted mt-1">If an account exists for {email}, we&apos;ve sent a reset link.</p>
            <Link href="/login" className="text-ccb-primary text-sm hover:underline mt-4 inline-block">Back to login</Link>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-lg bg-ccb-danger/10 border border-ccb-danger/30 text-ccb-danger px-4 py-3 text-sm mb-4">
                {error}
              </div>
            )}
            <form onSubmit={handleReset} className="card space-y-4">
              <div>
                <label htmlFor="email" className="text-sm font-medium block mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-field"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>
            <p className="text-center text-sm text-ccb-muted mt-6">
              Remembered it?{" "}
              <Link href="/login" className="text-ccb-primary hover:underline">Back to login</Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
