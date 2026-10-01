"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck, Swords, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
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

    let errorMessage: string | null = null;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        errorMessage = data.error || "Invalid username or password";
      } else {
        const { error: sessionErr } = await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
        if (sessionErr) { errorMessage = "Login failed — please try again";
        } else {
          // Affiliate attribution retry (2026-09-28): if THIS account's
          // signup attribution failed (blocker / network / 5xx), settle it
          // now. Only fires when the stored code is bound to this exact
          // account (see signup-client) - an existing user who merely clicked
          // a partner link is never attributed. Server-side idempotent.
          try {
            const ref = localStorage.getItem("ccb_ref_code");
            const boundUser = localStorage.getItem("ccb_ref_user");
            if (ref && boundUser) {
              const { data: { user } } = await supabase.auth.getUser();
              if (user && user.id === boundUser) {
                const trRes = await fetch("/api/affiliate/track", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ referrerCode: ref, referredId: user.id }),
                });
                if (trRes.ok) {
                  const trData = await trRes.json();
                  if (trData?.tracked || trData?.reason === "already_referred") {
                    localStorage.removeItem("ccb_ref_code");
                    localStorage.removeItem("ccb_ref_user");
                  }
                } else if (trRes.status >= 400 && trRes.status < 500) {
                  // Definitive rejection - stop retrying on every login.
                  localStorage.removeItem("ccb_ref_code");
                  localStorage.removeItem("ccb_ref_user");
                }
                // 5xx / network: keep both keys - retry on the next login.
              }
              // Different account: leave the keys untouched - the binding
              // stays inert until the bound account logs in.
            }
          } catch {
            // Attribution retry must never block login.
          }
        }
      }
    } catch {
      errorMessage = "Login failed — please try again";
    }

    if (errorMessage) {
      setError(errorMessage);
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
    <main className="relative isolate min-h-screen overflow-hidden bg-[#050d15] text-slate-100">
      <Image src="/chess-arena-hero-v2.png" alt="" fill priority sizes="100vw" className="-z-20 object-cover object-[58%_center]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(2,8,14,.9),rgba(2,8,14,.72)_52%,rgba(2,8,14,.84)),linear-gradient(0deg,rgba(2,8,14,.88),transparent_70%)]" />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-8 sm:py-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Crazy Chess Battles home">
          <Image src="/logo-badge.png" alt="" width={42} height={42} className="h-9 w-9 sm:h-10 sm:w-10" />
          <span className="leading-none"><span className="block text-sm font-black uppercase tracking-tight text-white sm:text-base">Crazy <b className="text-amber-300">Chess</b></span><span className="mt-1 block text-center text-[8px] font-bold uppercase tracking-[.38em] text-slate-300">Battles</span></span>
        </Link>
        <Link href="/" className="rounded-md px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white sm:text-sm">Back to home</Link>
      </header>

      <div className="relative z-10 mx-auto grid min-h-[calc(100vh-80px)] w-full max-w-7xl items-center gap-10 px-4 pb-8 pt-3 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(390px,460px)] lg:gap-16 lg:px-10 lg:pb-16">
        <section className="hidden max-w-2xl lg:block">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-slate-950/50 px-3 py-1.5 text-xs font-bold uppercase tracking-[.2em] text-emerald-200 backdrop-blur"><Swords className="h-4 w-4" /> Your next move awaits</div>
          <h1 className="text-6xl font-black uppercase leading-[.98] tracking-[-.045em] text-white xl:text-7xl">Back to the<br /><span className="bg-gradient-to-r from-amber-200 via-yellow-400 to-orange-300 bg-clip-text text-transparent">battle</span></h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-200">Pick up where you left off. Challenge a rival, join a tournament, and keep climbing the ranks.</p>
          <div className="mt-9 flex items-center gap-3 text-sm text-slate-300"><ShieldCheck className="h-5 w-5 text-emerald-300" /> Secure sign-in to your Crazy Chess Battles account</div>
        </section>

        <section className="mx-auto w-full max-w-md rounded-2xl border border-slate-500/60 bg-[#06111c]/90 p-5 shadow-[0_28px_90px_rgba(0,0,0,.55)] backdrop-blur-xl sm:p-8">
          <div className="mb-6 lg:mb-7">
            <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-300 lg:hidden"><Swords className="h-5 w-5" /></div>
            <p className="text-[10px] font-black uppercase tracking-[.2em] text-emerald-300">Welcome back</p>
            <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">Log in</h2>
            <p className="mt-1 text-sm text-slate-400">Continue your next battle.</p>
          </div>

          {error && <div role="alert" className="mb-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="identifier" className="mb-1.5 block text-xs font-semibold text-slate-200">Username or email</label>
              <div className="relative">
                <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input id="identifier" type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-950/70 py-3 pl-10 pr-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/15" placeholder="Your username or email" autoCapitalize="none" autoCorrect="off" autoComplete="username" required />
              </div>
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label htmlFor="password" className="text-xs font-semibold text-slate-200">Password</label>
                <Link href="/forgot-password" className="text-xs font-semibold text-emerald-300 transition hover:text-emerald-200">Forgot password?</Link>
              </div>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-slate-600 bg-slate-950/70 py-3 pl-10 pr-11 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-300 focus:ring-2 focus:ring-emerald-300/15" placeholder="Enter your password" autoComplete="current-password" required />
                <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/5 hover:text-white" aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading} className="group inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-500 px-5 text-sm font-black uppercase tracking-wide text-slate-950 shadow-[0_0_24px_rgba(16,230,143,.25)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60">
              {loading ? "Logging in..." : <>Log in <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></>}
            </button>
          </form>

          <p className="mt-6 border-t border-slate-800 pt-5 text-center text-sm text-slate-400">New to CCB? <Link href={signupLink} className="font-bold text-emerald-300 hover:text-emerald-200">Create an account</Link></p>
        </section>
      </div>
    </main>
  );
}
