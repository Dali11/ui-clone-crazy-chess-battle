"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { 
  X, Play, Swords, Crown, Trophy, ChevronRight, 
  Loader2, Sparkles, MousePointerClick, Zap
} from "lucide-react";

const WELCOME_SEEN_KEY = "ccb-welcome-seen";

type LeagueInfo = {
  id: string;
  name: string;
  tier: number;
  min_rating: number;
  max_rating: number | null;
};

export default function WelcomePopup() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  const [joining, setJoining] = useState(false);
  const [recommendedLeague, setRecommendedLeague] = useState<LeagueInfo | null>(null);
  const [userRating, setUserRating] = useState(0);
  const [joinResult, setJoinResult] = useState<"success" | "error" | null>(null);
  const freePlayRef = useRef<HTMLButtonElement | null>(null);
  const leagueRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // Only show for users who haven't seen it AND have an account < 7 days old
    const seen = localStorage.getItem(WELCOME_SEEN_KEY);
    if (seen) return;

    const timer = setTimeout(async () => {
      try {
        // Check if user profile exists and get account age
        const profileRes = await fetch("/api/profile/me");
        if (!profileRes.ok) return;
        const profile = await profileRes.json();

        // If account is older than 7 days, don't show welcome popup
        if (profile.created_at) {
          const accountAge = Date.now() - new Date(profile.created_at).getTime();
          if (accountAge > 7 * 24 * 60 * 60 * 1000) {
            // Mark as seen so we don't keep checking
            try { localStorage.setItem(WELCOME_SEEN_KEY, Date.now().toString()); } catch {}
            return;
          }
        }

        // Get league recommendation
        const res = await fetch("/api/league/popup-status");
        if (res.ok) {
          const data = await res.json();
          if (data.recommended) {
            setRecommendedLeague(data.recommended);
            setUserRating(data.userRating || 1200);
          }
        }
        setVisible(true);
      } catch {
        // Still show welcome even without league data
        setVisible(true);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    try { localStorage.setItem(WELCOME_SEEN_KEY, Date.now().toString()); } catch {}
    setVisible(false);
  };

  const handleAutoRegister = async () => {
    if (!recommendedLeague) {
      handleDismiss();
      router.push("/league");
      return;
    }
    setJoining(true);
    try {
      const res = await fetch("/api/league/auto-allocate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok && !data.alreadyRegistered) throw new Error(data.error);
      
      setJoinResult("success");
      setTimeout(() => {
        handleDismiss();
        router.push("/league");
      }, 1500);
    } catch {
      // Fallback: manual join
      try {
        const res = await fetch("/api/league/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leagueId: recommendedLeague.id }),
        });
        if (res.ok) {
          setJoinResult("success");
          setTimeout(() => {
            handleDismiss();
            router.push("/league");
          }, 1500);
        } else {
          setJoinResult("error");
        }
      } catch {
        setJoinResult("error");
      }
    } finally {
      setJoining(false);
    }
  };

  if (!visible) return null;

  const steps = [
    // Step 0: Welcome
    {
      title: "So here's what's going on here",
      content: (
        <div className="space-y-4">
          <p className="text-sm text-ccb-text leading-relaxed">
            Welcome to <span className="font-bold text-ccb-primary">Crazy Chess Battles</span> — 
            where chess meets real stakes and real competition.
          </p>
          <p className="text-xs text-ccb-muted leading-relaxed">
            Let's take a quick tour. It'll take 30 seconds.
          </p>
        </div>
      ),
      action: { label: "Let's go", icon: ChevronRight, next: true },
    },
    // Step 1: Free Play
    {
      title: "1. Free Play",
      icon: Play,
      content: (
        <div className="space-y-3">
          <p className="text-sm text-ccb-text leading-relaxed">
            Jump into a quick match anytime. No stakes, just chess. 
            Challenge your friends by sending them a link and win.
          </p>
          <div className="flex items-center gap-2 bg-ccb-primary/10 rounded-lg px-3 py-2.5">
            <MousePointerClick className="w-4 h-4 text-ccb-primary shrink-0 animate-pulse" />
            <p className="text-xs text-ccb-muted">
              <span className="font-semibold text-ccb-primary">Tap the Play button</span> in the bottom nav to start.
            </p>
          </div>
        </div>
      ),
      action: { label: "Next", icon: ChevronRight, next: true },
    },
    // Step 2: Staked Battles
    {
      title: "2. Staked Battles",
      icon: Swords,
      content: (
        <div className="space-y-3">
          <p className="text-sm text-ccb-text leading-relaxed">
            Think you can back your chess with your own money? 
            Challenge a friend by putting a stake — 
            win <span className="font-bold text-ccb-success">95% of your stake</span> when you win.
          </p>
          <div className="flex items-center gap-2 bg-ccb-accent/10 rounded-lg px-3 py-2.5">
            <Zap className="w-4 h-4 text-ccb-accent shrink-0" />
            <p className="text-xs text-ccb-muted">
              The thrill of real stakes. The platform takes just 5%.
            </p>
          </div>
        </div>
      ),
      action: { label: "Next", icon: ChevronRight, next: true },
    },
    // Step 3: Leagues (with auto-register)
    {
      title: "3. Premium Leagues",
      icon: Crown,
      content: (
        <div className="space-y-3">
          <p className="text-sm text-ccb-text leading-relaxed">
            Compete against players that match your skill level in our 
            <span className="font-bold text-ccb-primary"> 5-tier league system</span>.
          </p>
          {recommendedLeague && (
            <div className="bg-gradient-to-br from-ccb-primary/10 to-ccb-accent/10 border border-ccb-primary/20 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-ccb-primary shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wide text-ccb-primary">Recommended For You</span>
              </div>
              <p className="font-bold text-sm text-ccb-text">{recommendedLeague.name}</p>
              <p className="text-xs text-ccb-muted">
                Rating range: {recommendedLeague.min_rating}+{recommendedLeague.max_rating ? `–${recommendedLeague.max_rating}` : ""} · You: {userRating}
              </p>
              <p className="text-[11px] text-ccb-success font-semibold">
                ✅ Free entry during Season 1
              </p>
            </div>
          )}
          {joinResult === "success" && (
            <div className="bg-ccb-success/10 rounded-lg px-3 py-2 text-xs text-ccb-success font-medium text-center">
              You're in! Taking you to your league...
            </div>
          )}
          {joinResult === "error" && (
            <div className="bg-destructive/10 rounded-lg px-3 py-2 text-xs text-destructive font-medium text-center">
              Something went wrong. You can register manually from the Leagues page.
            </div>
          )}
        </div>
      ),
      action: { 
        label: joining ? "Registering..." : "Register", 
        icon: joining ? Loader2 : Crown, 
        onClick: handleAutoRegister,
        loading: joining,
      },
    },
    // Step 4: Tournaments
    {
      title: "4. Tournaments",
      icon: Trophy,
      content: (
        <div className="space-y-3">
          <p className="text-sm text-ccb-text leading-relaxed">
            Join paid or free tournaments and win. 
            Compete in <span className="font-bold text-ccb-accent">Arena</span>, 
            <span className="font-bold text-ccb-primary"> Swiss</span>, or 
            <span className="font-bold text-ccb-accent"> Knockouts</span> 
            and climb your way to glory.
          </p>
          <p className="text-xs text-ccb-muted leading-relaxed">
            And many more things you'll discover as you explore the app.
          </p>
        </div>
      ),
      action: { label: "Start Playing", icon: Play, onClick: handleDismiss },
    },
  ];

  const currentStep = steps[step];
  const StepIcon = currentStep.icon;
  const ActionIcon = currentStep.action?.icon;
  const isLastStep = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-sm bg-ccb-card border border-ccb-border rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-slide-up">
        {/* Header */}
        <div className="relative shrink-0 bg-gradient-to-br from-ccb-primary to-ccb-accent px-4 py-4">
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 text-white/80 hover:text-white p-1.5 rounded-md bg-black/20 hover:bg-black/30 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2.5">
            {StepIcon ? (
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <StepIcon className="w-4.5 h-4.5 text-white" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Sparkles className="w-4.5 h-4.5 text-white" />
              </div>
            )}
            <div className="min-w-0 pr-8">
              <h2 className="text-base font-black text-white leading-tight">{currentStep.title}</h2>
              <div className="flex items-center gap-1 mt-1">
                {steps.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1 rounded-full transition-all ${
                      i === step ? "w-5 bg-white" : i < step ? "w-1.5 bg-white/60" : "w-1.5 bg-white/25"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-5 flex-1 overflow-y-auto">
          {currentStep.content}
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 pb-5 pt-2 border-t border-ccb-border">
          {step > 0 && !currentStep.action?.onClick && (
            <button
              onClick={() => setStep(step - 1)}
              className="text-xs text-ccb-muted hover:text-ccb-text font-medium mb-2"
            >
              ← Back
            </button>
          )}
          <div className="flex items-center gap-2">
            {!isLastStep && !currentStep.action?.onClick && (
              <button
                onClick={() => setStep(step + 1)}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-ccb-primary to-ccb-accent hover:opacity-90 text-white text-sm font-bold px-4 py-3 transition-all"
              >
                {ActionIcon && <ActionIcon className="w-4 h-4" />}
                {currentStep.action?.label || "Next"}
              </button>
            )}
            {currentStep.action?.onClick && (
              <button
                onClick={currentStep.action.onClick}
                disabled={currentStep.action.loading}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-ccb-primary to-ccb-accent hover:opacity-90 text-white text-sm font-bold px-4 py-3 transition-all disabled:opacity-50"
              >
                {ActionIcon && <ActionIcon className={`w-4 h-4 ${currentStep.action.loading ? "animate-spin" : ""}`} />}
                {currentStep.action.label}
              </button>
            )}
            {isLastStep && (
              <button
                onClick={handleDismiss}
                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-ccb-primary to-ccb-accent hover:opacity-90 text-white text-sm font-bold px-4 py-3 transition-all"
              >
                {ActionIcon && <ActionIcon className="w-4 h-4" />}
                {currentStep.action?.label || "Done"}
              </button>
            )}
            {!isLastStep && (
              <button
                onClick={handleDismiss}
                className="text-xs text-ccb-muted hover:text-ccb-text font-medium px-2"
              >
                Skip
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
