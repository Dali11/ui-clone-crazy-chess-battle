"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Check, Loader2, AlertCircle, ChevronRight, ChevronLeft } from "lucide-react";

export const dynamic = "force-dynamic";

type ChessLevel = "beginner" | "intermediate" | "expert";
type Step = 0 | 1 | 2 | 3;

const LEVEL_CONFIG: Record<ChessLevel, { label: string; rating: number; blurb: string; icon: string; accent: string }> = {
  beginner: {
    label: "Beginner",
    rating: 400,
    blurb: "New to chess or still learning the basics",
    icon: "♟",
    accent: "border-ccb-bronze bg-ccb-bronze/10",
  },
  intermediate: {
    label: "Casual",
    rating: 1500,
    blurb: "Comfortable with tactics and openings",
    icon: "♞",
    accent: "border-ccb-accent bg-ccb-accent/10",
  },
  expert: {
    label: "Expert",
    rating: 2500,
    blurb: "Experienced competitive player",
    icon: "♛",
    accent: "border-purple-500 bg-purple-500/10",
  },
};

const STEPS = ["Profile", "Experience", "Chess.com", "Security"];

export default function SignupPage() {
  const [step, setStep] = useState<Step>(0);

  // Step 0: Profile
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  // Step 1: Experience
  const [chessLevel, setChessLevel] = useState<ChessLevel | null>(null);

  // Step 2: Chess.com (optional)
  const [hasChesscom, setHasChesscom] = useState<boolean | null>(null);
  const [chesscomUsername, setChesscomUsername] = useState("");
  const [chesscomChecking, setChesscomChecking] = useState(false);
  const [chesscomVerified, setChesscomVerified] = useState<{
    username: string;
    avatar: string;
    rating: number;
    ratings: { blitz: number | null; rapid: number | null; bullet: number | null };
  } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCheckedRef = useRef<string>("");

  // Step 3: Security
  const [password, setPassword] = useState("");

  // Shared
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refCode, setRefCode] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const redirectPath = searchParams.get("redirect") || "/dashboard";
  const actionParam = searchParams.get("action");

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      setRefCode(ref);
      localStorage.setItem("ccb_ref_code", ref);
    } else {
      const stored = localStorage.getItem("ccb_ref_code");
      if (stored) setRefCode(stored);
    }
  }, [searchParams]);

  // Chess.com auto-detect
  const checkChesscom = useCallback(async (name: string) => {
    const clean = name.trim().toLowerCase();
    if (!clean || clean.length < 3) {
      setChesscomVerified(null);
      setChesscomChecking(false);
      return;
    }
    if (clean === lastCheckedRef.current) return;
    lastCheckedRef.current = clean;

    setChesscomChecking(true);
    setChesscomVerified(null);

    try {
      const res = await fetch("/api/chesscom/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: clean }),
      });
      const data = await res.json();
      if (res.ok && data.found) {
        setChesscomVerified({
          username: data.username,
          avatar: data.avatar || "",
          rating: data.startingRating,
          ratings: {
            blitz: data.ratings?.blitz || null,
            rapid: data.ratings?.rapid || null,
            bullet: data.ratings?.bullet || null,
          },
        });
      }
    } catch {
      // Silent fail
    } finally {
      setChesscomChecking(false);
    }
  }, []);

  useEffect(() => {
    if (hasChesscom !== true) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (chesscomUsername.trim().length >= 3) {
      setChesscomChecking(true);
      debounceRef.current = setTimeout(() => {
        checkChesscom(chesscomUsername);
      }, 600);
    } else {
      setChesscomChecking(false);
      setChesscomVerified(null);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [chesscomUsername, hasChesscom, checkChesscom]);

  const canProceed = () => {
    switch (step) {
      case 0: return username.trim().length >= 3 && email.trim().includes("@");
      case 1: return chessLevel !== null;
      case 2: return hasChesscom === false || (hasChesscom === true && chesscomVerified !== null);
      case 3: return password.length >= 8;
      default: return false;
    }
  };

  const handleNext = () => {
    setError(null);
    if (step < 3 && canProceed()) {
      setStep((step + 1) as Step);
    }
  };

  const handleBack = () => {
    setError(null);
    if (step > 0) setStep((step - 1) as Step);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username.trim(),
            display_name: username.trim(),
            chess_level: chessLevel,
            chesscom_username: chesscomVerified?.username || null,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      if (!data?.user?.id) {
        setError("Signup succeeded but no user was returned. Please try logging in.");
        setLoading(false);
        return;
      }

      try {
        await fetch("/api/auth/set-rating", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: data.user.id,
            chessLevel,
            chesscomRating: chesscomVerified?.rating || null,
            chesscomUsername: chesscomVerified?.username || null,
          }),
        });

        const ref = refCode || localStorage.getItem("ccb_ref_code");
        if (ref) {
          await fetch("/api/berry/referral/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ referralCode: ref, referredId: data.user.id }),
          });
          localStorage.removeItem("ccb_ref_code");
        }

        // Award 500 berry welcome bonus to new users
        await fetch("/api/berry/welcome-bonus", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: data.user.id }),
        });
      } catch (postErr: any) {
        console.error("Post-signup error:", postErr);
      }

      const fullRedirect = actionParam
        ? `${redirectPath}?action=${actionParam}`
        : redirectPath;
      router.push(fullRedirect);
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  const loginParams = new URLSearchParams();
  if (redirectPath !== "/dashboard") loginParams.set("redirect", redirectPath);
  if (actionParam) loginParams.set("action", actionParam);
  const loginLink = loginParams.toString() ? `/login?${loginParams.toString()}` : "/login";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center gap-2">
            <Image src="/logo-badge.png" alt="Crazy Chess Battles" width={40} height={40} className="w-10 h-10 rounded-full" />
            <span className="text-lg font-bold">Crazy Chess Battles</span>
          </Link>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((label, i) => (
            <div key={label} className="flex-1">
              <div
                className={`h-1.5 rounded-full transition-colors ${
                  i <= step ? "bg-ccb-primary" : "bg-ccb-border"
                }`}
              />
              <p className={`text-[10px] mt-1 text-center transition-colors ${
                i === step ? "text-ccb-primary font-semibold" : "text-ccb-muted"
              }`}>
                {label}
              </p>
            </div>
          ))}
        </div>

        {refCode && step === 0 && (
          <div className="rounded-lg bg-ccb-primary/10 border border-ccb-primary/30 px-4 py-3 mb-4 text-center">
            <p className="text-sm font-semibold text-ccb-primary">
              🍒 Referred by {refCode} — you&apos;ll earn 500+ berries and more when you start playing!
            </p>
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-ccb-danger/10 border border-ccb-danger/30 text-ccb-danger px-4 py-3 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="card space-y-5">
          {/* STEP 0: Profile */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold">Let&apos;s get started</h2>
              <p className="text-sm text-ccb-muted -mt-3">Tell us a bit about yourself.</p>

              <div>
                <label htmlFor="username" className="text-sm font-medium block mb-1.5">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="input"
                  placeholder="Pick your username"
                  required
                  minLength={3}
                  maxLength={20}
                  autoFocus
                />
                <p className="text-xs text-ccb-muted mt-1">This will also be your referral code.</p>
              </div>

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
            </div>
          )}

          {/* STEP 1: Experience */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold">What&apos;s your chess level?</h2>
              <p className="text-sm text-ccb-muted -mt-3">We&apos;ll use this to set your starting ELO.</p>

              <div className="grid grid-cols-3 gap-2 pt-2">
                {(Object.keys(LEVEL_CONFIG) as ChessLevel[]).map((level) => {
                  const config = LEVEL_CONFIG[level];
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setChessLevel(level)}
                      className={`rounded-lg border-2 p-4 text-center transition-all ${
                        chessLevel === level
                          ? config.accent
                          : "border-ccb-border bg-ccb-surface hover:bg-ccb-card"
                      }`}
                    >
                      <span className="text-3xl block mb-1.5">{config.icon}</span>
                      <span className="text-xs font-semibold block">{config.label}</span>
                      <span className="text-[10px] text-ccb-muted block mt-0.5">~{config.rating} ELO</span>
                    </button>
                  );
                })}
              </div>
              {chessLevel && (
                <p className="text-xs text-ccb-muted">
                  {LEVEL_CONFIG[chessLevel].blurb}
                </p>
              )}
            </div>
          )}

          {/* STEP 2: Chess.com (optional) */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold">Chess.com account?</h2>
              <p className="text-sm text-ccb-muted -mt-3">
                Optional — link it for an accurate starting rating instead of the level estimate.
              </p>

              {hasChesscom === null && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setHasChesscom(true)}
                    className="rounded-lg border border-ccb-border bg-ccb-surface hover:bg-ccb-card p-4 text-center transition-all"
                  >
                    <Check className="w-5 h-5 mx-auto mb-1.5 text-green-500" />
                    <span className="text-sm font-semibold">Yes, I have one</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHasChesscom(false)}
                    className="rounded-lg border border-ccb-border bg-ccb-surface hover:bg-ccb-card p-4 text-center transition-all"
                  >
                    <span className="text-sm font-semibold block mt-1.5">No, skip this</span>
                    <span className="text-[10px] text-ccb-muted">Use my level rating</span>
                  </button>
                </div>
              )}

              {hasChesscom === true && (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-sm font-medium block mb-1.5">Chess.com Username</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={chesscomUsername}
                        onChange={(e) => setChesscomUsername(e.target.value)}
                        className="input w-full pr-10"
                        placeholder="Your Chess.com username"
                        autoFocus
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {chesscomChecking && chesscomUsername.trim().length >= 3 && (
                          <Loader2 className="w-4 h-4 animate-spin text-ccb-muted" />
                        )}
                        {chesscomVerified && !chesscomChecking && (
                          <Check className="w-4 h-4 text-green-500" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Detected profile */}
                  {chesscomVerified && (
                    <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 flex items-center gap-3">
                      {chesscomVerified.avatar ? (
                        <img src={chesscomVerified.avatar} alt="" className="w-10 h-10 rounded-full" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center">
                          <span className="text-sm font-bold">{chesscomVerified.username?.[0]?.toUpperCase()}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          <span className="text-green-500 font-semibold">Found</span> · {chesscomVerified.username}
                        </p>
                        <div className="flex gap-3 text-xs text-ccb-muted mt-0.5">
                          {chesscomVerified.ratings.rapid && <span>Rapid: {chesscomVerified.ratings.rapid}</span>}
                          {chesscomVerified.ratings.blitz && <span>Blitz: {chesscomVerified.ratings.blitz}</span>}
                          {chesscomVerified.ratings.bullet && <span>Bullet: {chesscomVerified.ratings.bullet}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-ccb-primary">{chesscomVerified.rating}</div>
                        <div className="text-[10px] text-ccb-muted">Starting ELO</div>
                      </div>
                    </div>
                  )}

                  {chesscomUsername.trim().length >= 3 && !chesscomChecking && !chesscomVerified && (
                    <p className="text-xs text-ccb-muted flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Account not found — check the spelling or skip this step.
                    </p>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setHasChesscom(false);
                      setChesscomVerified(null);
                      setChesscomUsername("");
                    }}
                    className="text-xs text-ccb-muted hover:text-ccb-primary"
                  >
                    Skip — I&apos;ll use my level rating ({chessLevel ? LEVEL_CONFIG[chessLevel].rating : "—"} ELO)
                  </button>
                </div>
              )}

              {hasChesscom === false && (
                <div className="rounded-lg border border-ccb-border bg-ccb-surface p-4 text-center">
                  <p className="text-sm">
                    No problem! You&apos;ll start at{" "}
                    <span className="font-bold text-ccb-primary">
                      {chessLevel ? LEVEL_CONFIG[chessLevel].rating : "—"} ELO
                    </span>{" "}
                    based on your level.
                  </p>
                  <button
                    type="button"
                    onClick={() => setHasChesscom(null)}
                    className="text-xs text-ccb-muted hover:text-ccb-primary mt-2"
                  >
                    Actually, I do have a Chess.com account
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Security */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-lg font-bold">Secure your account</h2>
              <p className="text-sm text-ccb-muted -mt-3">Pick a password — at least 8 characters.</p>

              <div>
                <label htmlFor="password" className="text-sm font-medium block mb-1.5">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                  required
                  minLength={8}
                  autoFocus
                />
              </div>

              {/* Summary */}
              <div className="rounded-lg border border-ccb-border bg-ccb-surface p-3 space-y-1.5">
                <p className="text-xs font-semibold text-ccb-muted mb-1">Account Summary</p>
                <p className="text-sm flex justify-between">
                  <span className="text-ccb-muted">Username</span>
                  <span className="font-medium">{username}</span>
                </p>
                <p className="text-sm flex justify-between">
                  <span className="text-ccb-muted">Email</span>
                  <span className="font-medium truncate ml-2">{email}</span>
                </p>
                <p className="text-sm flex justify-between">
                  <span className="text-ccb-muted">Level</span>
                  <span className="font-medium">{chessLevel ? LEVEL_CONFIG[chessLevel].label : "—"}</span>
                </p>
                <p className="text-sm flex justify-between">
                  <span className="text-ccb-muted">Starting ELO</span>
                  <span className="font-bold text-ccb-primary">
                    {chesscomVerified?.rating || (chessLevel ? LEVEL_CONFIG[chessLevel].rating : "—")}
                  </span>
                </p>
                {chesscomVerified && (
                  <p className="text-xs text-green-500 flex items-center gap-1 pt-1">
                    <Check className="w-3 h-3" /> Chess.com linked: {chesscomVerified.username}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex gap-2 pt-2">
            {step > 0 && (
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1 rounded-lg border border-ccb-border bg-ccb-surface hover:bg-ccb-card px-4 py-2.5 text-sm font-medium transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canProceed()}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
              >
                Continue <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading || !canProceed()}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Creating account..." : "Create account"}
              </button>
            )}
          </div>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-ccb-muted mb-3">Already have an account?</p>
          <Link
            href={loginLink}
            className="btn-secondary w-full inline-flex items-center justify-center gap-2 px-6 py-3 text-base font-medium"
          >
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}

