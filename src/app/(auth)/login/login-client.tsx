"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const redirectPath = searchParams.get("redirect") || "/dashboard";
  const actionParam = searchParams.get("action");
  const refCode = searchParams.get("ref");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
    } else {
      const fullRedirect = actionParam
        ? `${redirectPath}?action=${actionParam}`
        : redirectPath;
      router.push(fullRedirect);
      router.refresh();
    }
  };

  const signupParams = new URLSearchParams();
  if (redirectPath !== "/dashboard") signupParams.set("redirect", redirectPath);
  if (actionParam) signupParams.set("action", actionParam);
  if (refCode) signupParams.set("ref", refCode);
  const signupLink = `/signup?${signupParams.toString()}`;

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={40} height={40} className="w-10 h-10 rounded-full" />
            <span className="text-lg font-bold">Crazy Chess Battles</span>
          </Link>
          <h1 className="text-2xl font-bold mt-4">Welcome back</h1>
          <p className="text-sm text-ccb-muted mt-1">Log in to continue battling</p>
        </div>

        {error && (
          <div className="rounded-lg bg-ccb-danger/10 border border-ccb-danger/30 text-ccb-danger px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="card space-y-4">
          <div>
            <label htmlFor="email" className="text-sm font-medium block mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="text-sm font-medium">Password</label>
              <Link href="/forgot-password" className="text-xs text-ccb-muted hover:text-ccb-primary">Forgot?</Link>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              required
            />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <p className="text-center text-sm text-ccb-muted mt-6">
          New to CCB?{" "}
          <Link href={signupLink} className="text-ccb-primary hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}
