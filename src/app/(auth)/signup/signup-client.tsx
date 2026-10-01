"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Check, Loader2, AlertCircle, ChevronRight, ChevronLeft, Eye, EyeOff, Globe2, LockKeyhole, Mail, Swords, UserRound } from "lucide-react";

export const dynamic = "force-dynamic";

type ChessLevel = "beginner" | "intermediate" | "expert";
type Step = 0 | 1 | 2 | 3;

const LEVEL_CONFIG: Record<ChessLevel, { label: string; rating: number; blurb: string; icon: string }> = {
  beginner: {
    label: "Beginner",
    rating: 400,
    blurb: "New to chess or still learning the basics",
    icon: "♟",
  },
  intermediate: {
    label: "Casual",
    rating: 1500,
    blurb: "Comfortable with tactics and openings",
    icon: "♞",
  },
  expert: {
    label: "Expert",
    rating: 2500,
    blurb: "Experienced competitive player",
    icon: "♛",
  },
};

const STEPS = ["Profile", "Experience", "Chess.com", "Security"];

export default function SignupPage() {
  const [step, setStep] = useState<Step>(0);

  // Step 0: Profile
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("MW");

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
  const [showPassword, setShowPassword] = useState(false);

  // Shared
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refCode, setRefCode] = useState<string | null>(null);

  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const redirectPath = searchParams.get("redirect") || "/dashboard";
  const actionParam = searchParams.get("action");

  // Geo-detect the player's country so registration is NOT asking them to
  // pick — it comes pre-filled with their location and they can optionally
  // change it. Locked after account creation (one change allowed later in
  // Settings).
  const [geoDone, setGeoDone] = useState(false);

  useEffect(() => {
    const c = searchParams.get("country");
    if (c) { setCountry(c.toUpperCase()); setGeoDone(true); return; }
    // No explicit choice — use IP geo-detection (Vercel header, free)
    fetch("/api/currency")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.countryCode) setCountry(data.countryCode.toUpperCase()); })
      .catch(() => {})
      .finally(() => setGeoDone(true));
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
      // Check if signups are allowed via platform settings
      try {
        const checkRes = await fetch("/api/auth/signup-check");
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (!checkData.allowSignup) {
            setError("New registrations are currently disabled. Please check back later.");
            setLoading(false);
            return;
          }
        }
      } catch {}

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username.trim(),
            display_name: username.trim(),
            chess_level: chessLevel,
            chesscom_username: chesscomVerified?.username || null,
            country: country,
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

      // ── Post-signup: rating setup + referral attribution (2026-09-28
      // hardening). Attribution now happens SERVER-SIDE in set-rating (the
      // first credit-able moment), with the direct track call kept as a
      // fallback. The stored code is only cleared on a definitive outcome —
      // a transient failure leaves it bound to THIS account so the next
      // login retries it (see login-client).
      let refSettled = false;
      const ref = refCode || localStorage.getItem("ccb_ref_code");
      if (ref) {
        // Bind the pending attribution to this account BEFORE any network
        // call — only this user's login will retry it, never another account.
        localStorage.setItem("ccb_ref_user", data.user.id);
      }

      try {
        const srRes = await fetch("/api/auth/set-rating", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: data.user.id,
            chessLevel,
            chesscomRating: chesscomVerified?.rating || null,
            chesscomUsername: chesscomVerified?.username || null,
            country,
            refCode: ref || undefined,
          }),
        });
        if (srRes.ok) {
          const srData = await srRes.json();
          if (srData?.refTracked) refSettled = true;
        }
      } catch (srErr: any) {
        console.error("Post-signup rating error:", srErr);
      }

      // Fallback (also settles a server-side track that the block above
      // missed, e.g. when set-rating hit its signup window limit):
      if (ref && !refSettled) {
        try {
          const trRes = await fetch("/api/affiliate/track", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ referrerCode: ref, referredId: data.user.id }),
          });
          if (trRes.ok) {
            const trData = await trRes.json();
            if (trData?.tracked || trData?.reason === "already_referred") {
              refSettled = true;
            }
          } else if (trRes.status >= 400 && trRes.status < 500) {
            // Definitive rejection (unknown code / self-referral) — stop retrying.
            refSettled = true;
          }
        } catch (refErr) {
          console.error("Referral tracking failed:", refErr);
        }
        // 5xx or network error: keep the stored code + binding for the
        // login-time retry. Never clear on a maybe-transient failure.
      }

      if (ref && refSettled) {
        localStorage.removeItem("ccb_ref_code");
        localStorage.removeItem("ccb_ref_user");
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
    <main className="relative isolate min-h-screen overflow-hidden bg-[#050d15] text-slate-100">
      <Image src="/chess-arena-hero-v2.png" alt="" fill priority sizes="100vw" className="-z-20 object-cover object-[78%_center] lg:object-[55%_center]" />
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(2,8,14,.66),rgba(2,8,14,.78)_38%,rgba(2,8,14,.94)),linear-gradient(90deg,rgba(2,8,14,.25),rgba(2,8,14,.6))]" />

      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-8 sm:py-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Crazy Chess Battles home">
          <Image src="/logo-badge.png" alt="" width={42} height={42} className="h-9 w-9 sm:h-10 sm:w-10" />
          <span className="leading-none"><span className="block text-sm font-black uppercase tracking-tight text-white sm:text-base">Crazy <b className="text-amber-300">Chess</b></span><span className="mt-1 block text-center text-[8px] font-bold uppercase tracking-[.38em] text-slate-300">Battles</span></span>
        </Link>
        <Link href="/" className="hidden rounded-md px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/5 hover:text-white sm:inline-flex sm:text-sm">Back to home</Link>
      </header>

      <div className="relative z-10 mx-auto flex min-h-[calc(100vh-80px)] w-full max-w-7xl items-center justify-center px-4 pb-8 pt-2 sm:px-8 lg:px-10 lg:pb-14">
        <section className="mx-auto w-full max-w-lg rounded-2xl border border-slate-500/60 bg-[#06111c]/90 p-4 shadow-[0_28px_90px_rgba(0,0,0,.55)] backdrop-blur-xl sm:p-6">
        <div className="mb-5 flex flex-col items-center text-center sm:mb-6">
          <span className="mb-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-300/20 bg-emerald-300/10 text-emerald-300"><Swords className="h-4 w-4" /></span>
          <div><h2 className="text-[1.65rem] font-black uppercase italic leading-none tracking-tight text-white sm:text-2xl">Join Crazy Chess Battles</h2><p className="mt-2 max-w-xs text-xs leading-relaxed text-slate-300">Create your account and start playing real players from around the world.</p></div>
        </div>

        {/* Progress bar */}
        <div aria-label={`Registration step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`} className="mb-5 flex items-start gap-2 sm:mb-6 sm:gap-3">
          {STEPS.map((label, i) => (
            <div key={label} className="min-w-0 flex-1">
              <div className={`h-1.5 rounded-full transition-colors ${i <= step ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,.3)]" : "bg-slate-700"}`} />
              <p className={`mt-1.5 hidden truncate text-center text-[9px] transition-colors sm:block sm:text-[10px] ${i === step ? "font-bold text-emerald-300" : "text-slate-500"}`}>{label}</p>
            </div>
          ))}
        </div>

        {refCode && step === 0 && (
          <div className="mb-4 rounded-lg border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 text-center">
            <p className="text-xs font-semibold text-emerald-200">You were invited to join the battle. Create your account to get started.</p>
          </div>
        )}

        {error && (
          <div role="alert" className="mb-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-3.5 border-0 bg-transparent p-0 sm:space-y-5">
          {/* STEP 0: Profile */}
          {step === 0 && (
            <div className="space-y-4">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-white">Let&apos;s get started</h2>
              <p className="-mt-3 text-xs text-slate-400">Tell us a bit about yourself.</p>

              <div>
                <label htmlFor="username" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-300">
                  Username
                </label>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="input !border-slate-600 !bg-slate-950/70 pl-10 !text-white placeholder:!text-slate-600 focus:!border-emerald-300"
                    placeholder="Choose a username"
                    required
                    minLength={3}
                    maxLength={20}
                    autoComplete="username"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-ccb-muted mt-1">This will also be your referral code.</p>
              </div>

              <div>
                <label htmlFor="email" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-300">Email</label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input !border-slate-600 !bg-slate-950/70 pl-10 !text-white placeholder:!text-slate-600 focus:!border-emerald-300"
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="country" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-300">Country <span className="font-normal normal-case tracking-normal text-slate-500">(auto-detected)</span></label>
                <p className="text-xs text-ccb-muted mb-1.5">Locked to your location at signup — you can change it once later in Settings.</p>
                <div className="relative">
                <Globe2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <select
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="input cursor-pointer !border-slate-600 !bg-slate-950/70 pl-10 !text-white focus:!border-emerald-300"
                >
                  <option value="MW">Malawi</option>
                  <option value="ZM">Zambia</option>
                  <option value="KE">Kenya</option>
                  <option value="NG">Nigeria</option>
                  <option value="ZA">South Africa</option>
                  <option value="GH">Ghana</option>
                  <option value="TZ">Tanzania</option>
                  <option value="UG">Uganda</option>
                  <option value="ZW">Zimbabwe</option>
                  <option value="BW">Botswana</option>
                  <option value="NA">Namibia</option>
                  <option value="RW">Rwanda</option>
                  <option value="CM">Cameroon</option>
                  <option value="EG">Egypt</option>
                  <option value="ET">Ethiopia</option>
                  <option value="MA">Morocco</option>
                  <option value="SN">Senegal</option>
                  <option value="OTHER">Other</option>
                </select>
                </div>
                <p className="text-xs text-ccb-muted mt-1">Used for competitive divisions and localized pricing.</p>
              </div>
            </div>
          )}

          {/* STEP 1: Experience */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-white">What&apos;s your chess level?</h2>
              <p className="text-sm text-ccb-muted -mt-3">We&apos;ll use this to set your starting ELO.</p>

              <div className="grid grid-cols-3 gap-2 pt-2">
                {(Object.keys(LEVEL_CONFIG) as ChessLevel[]).map((level) => {
                  const config = LEVEL_CONFIG[level];
                  return (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setChessLevel(level)}
                      className={`rounded-lg border p-3 text-center transition-all sm:p-4 ${
                        chessLevel === level
                          ? "border-emerald-300 bg-emerald-300/10 text-emerald-100"
                          : "border-slate-700 bg-slate-900/70 text-slate-200 hover:border-slate-500 hover:bg-slate-900"
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
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-white">Chess.com account?</h2>
              <p className="text-sm text-ccb-muted -mt-3">
                Optional — link it for an accurate starting rating instead of the level estimate.
              </p>

              {hasChesscom === null && (
                <div className="grid grid-cols-2 gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setHasChesscom(true)}
                    className="rounded-lg border border-slate-700 bg-slate-900/70 p-4 text-center transition-all hover:border-emerald-300/50 hover:bg-slate-900"
                  >
                    <Check className="w-5 h-5 mx-auto mb-1.5 text-green-500" />
                    <span className="text-sm font-semibold">Yes, I have one</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setHasChesscom(false)}
                    className="rounded-lg border border-slate-700 bg-slate-900/70 p-4 text-center transition-all hover:border-slate-500 hover:bg-slate-900"
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
                        id="chesscom-username"
                        type="text"
                        value={chesscomUsername}
                        onChange={(e) => setChesscomUsername(e.target.value)}
                        className="input w-full !border-slate-600 !bg-slate-950/70 pr-10 !text-white placeholder:!text-slate-600 focus:!border-emerald-300"
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
                  <div className="rounded-lg border border-emerald-300/25 bg-emerald-300/10 p-3 flex items-center gap-3">
                      {chesscomVerified.avatar ? (
                        <img src={chesscomVerified.avatar} alt="" className="w-10 h-10 rounded-full" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-ccb-surface border border-ccb-border flex items-center justify-center">
                          <span className="text-sm font-bold">{chesscomVerified.username?.[0]?.toUpperCase()}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          <span className="font-semibold text-emerald-300">Found</span> · {chesscomVerified.username}
                        </p>
                        <div className="flex gap-3 text-xs text-ccb-muted mt-0.5">
                          {chesscomVerified.ratings.rapid && <span>Rapid: {chesscomVerified.ratings.rapid}</span>}
                          {chesscomVerified.ratings.blitz && <span>Blitz: {chesscomVerified.ratings.blitz}</span>}
                          {chesscomVerified.ratings.bullet && <span>Bullet: {chesscomVerified.ratings.bullet}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-emerald-300">{chesscomVerified.rating}</div>
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
                    className="text-xs text-slate-400 hover:text-emerald-300"
                  >
                    Skip — I&apos;ll use my level rating ({chessLevel ? LEVEL_CONFIG[chessLevel].rating : "—"} ELO)
                  </button>
                </div>
              )}

              {hasChesscom === false && (
                  <div className="rounded-lg border border-slate-700 bg-slate-900/70 p-4 text-center">
                  <p className="text-sm">
                    No problem! You&apos;ll start at{" "}
                    <span className="font-bold text-emerald-300">
                      {chessLevel ? LEVEL_CONFIG[chessLevel].rating : "—"} ELO
                    </span>{" "}
                    based on your level.
                  </p>
                  <button
                    type="button"
                    onClick={() => setHasChesscom(null)}
                    className="mt-2 text-xs text-slate-400 hover:text-emerald-300"
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
              <h2 className="text-sm font-extrabold uppercase tracking-wide text-white">Secure your account</h2>
              <p className="text-sm text-ccb-muted -mt-3">Pick a password — at least 8 characters.</p>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-[11px] font-bold uppercase tracking-wide text-slate-300">Password</label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input !border-slate-600 !bg-slate-950/70 pl-10 pr-11 !text-white placeholder:!text-slate-600 focus:!border-emerald-300"
                    placeholder="At least 8 characters"
                    required
                    minLength={8}
                    autoComplete="new-password"
                    autoFocus
                  />
                  <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/5 hover:text-white" aria-label={showPassword ? "Hide password" : "Show password"}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Summary */}
              <div className="space-y-1.5 rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                <p className="mb-1 text-xs font-semibold text-slate-400">Account Summary</p>
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
                  <span className="font-bold text-emerald-300">
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
                className="flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-slate-400 hover:bg-slate-800"
              >
                <ChevronLeft className="w-4 h-4" /> Back
              </button>
            )}

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canProceed()}
                className="flex min-h-11 flex-1 items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-500 px-4 text-sm font-black text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading || !canProceed()}
                className="min-h-11 flex-1 rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-500 px-4 text-sm font-black text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Creating account..." : "Create account"}
              </button>
            )}
          </div>
        </form>

        {step === 3 && <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-500">By creating an account, you agree to our <Link href="/terms" className="text-emerald-300 hover:underline">Terms of Service</Link> and <Link href="/privacy" className="text-emerald-300 hover:underline">Privacy Policy</Link>.</p>}

        <p className="mt-5 text-center text-xs text-slate-400">Already have an account? <Link href={loginLink} className="font-bold text-emerald-300 hover:text-emerald-200">Log in</Link></p>
        </section>
      </div>
    </main>
  );
}
