"use client";

import Link from "next/link";
import { useEffect } from "react";
import { isChunkError, recoverFromChunkError } from "@/components/ChunkErrorRecovery";

type ErrorVariant = "404" | "500" | "error" | "offline";

interface ErrorPageProps {
  variant: ErrorVariant;
  title?: string;
  message?: string;
  error?: Error & { digest?: string };
  reset?: () => void;
}

const VARIANTS: Record<
  ErrorVariant,
  { code: string; title: string; message: string; piece: string }
> = {
  "404": {
    code: "404",
    title: "Off the board",
    message: "This page doesn't exist — maybe it was captured.",
    piece: "♞",
  },
  "500": {
    code: "500",
    title: "Server blunder",
    message: "Something broke on our end. We're working on it.",
    piece: "♚",
  },
  error: {
    code: "!",
    title: "Something went wrong",
    message: "An unexpected error occurred. Try again or head back home.",
    piece: "♜",
  },
  offline: {
    code: "—",
    title: "You're offline",
    message: "Check your connection and try again.",
    piece: "♟",
  },
};

export function ErrorPage({
  variant,
  title: customTitle,
  message: customMessage,
  error,
  reset,
}: ErrorPageProps) {
  const config = VARIANTS[variant];

  useEffect(() => {
    if (!error) return;
    console.error("[error-page]", error);
    // Stale-bundle error (deploy rotated the chunk hashes out from under
    // this open tab): auto-reload for a fresh bundle instead of showing
    // the scary fallback screen. React funnels next/dynamic import
    // failures straight into this boundary — they never reach the
    // window-level listener in ChunkErrorRecovery, so it's replicated here.
    if (isChunkError(error.message)) {
      recoverFromChunkError();
    }
  }, [error]);

  const title = customTitle || config.title;
  const message = customMessage || config.message;

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-20 overflow-hidden">
      {/* Ambient glow background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full bg-ccb-primary/8 blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full bg-ccb-accent/5 blur-[100px]" />
      </div>

      {/* Chess board grid pattern */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)
          `,
          backgroundSize: "48px 48px",
        }}
      />

      {error && (
        <div style={{position:"fixed",top:0,left:0,right:0,background:"#000",color:"#0f0",fontSize:10,padding:8,zIndex:9999,maxHeight:"40vh",overflow:"auto",textAlign:"left",fontFamily:"monospace"}}>
          DEBUG: {error.message}
          <pre>{error.stack}</pre>
        </div>
      )}
      <div className="relative z-10 text-center max-w-md w-full animate-fade-in">
        {/* Chess piece with glow */}
        <div className="relative inline-block mb-8">
          <div className="absolute inset-0 bg-ccb-primary/20 blur-2xl rounded-full" />
          <div className="relative text-7xl sm:text-8xl leading-none select-none filter drop-shadow-[0_0_25px_rgba(124,58,237,0.35)]">
            {config.piece}
          </div>
        </div>

        {/* Error code badge */}
        <div className="inline-flex items-center gap-2 rounded-full bg-ccb-card border border-ccb-border px-4 py-1.5 mb-6">
          <span className="w-2 h-2 rounded-full bg-ccb-danger animate-pulse" />
          <span className="text-xs font-mono tracking-wider text-ccb-muted">
            ERROR {config.code}
          </span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-ccb-text mb-3">
          {title}
        </h1>
        <p className="text-sm text-ccb-muted mb-2 max-w-xs mx-auto leading-relaxed">
          {message}
        </p>

        {/* Error digest for support */}
        {error?.digest && (
          <p className="text-xs font-mono text-ccb-text/20 mb-6">
            ref: {error.digest}
          </p>
        )}

        {!error?.digest && <div className="mb-6" />}

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {reset && (
            <button
              onClick={reset}
              className="btn-primary w-full sm:w-auto px-6 py-2.5"
            >
              Try Again
            </button>
          )}
          <Link
            href="/"
            className="btn-secondary w-full sm:w-auto px-6 py-2.5"
          >
            Back to Home
          </Link>
          {variant !== "404" && (
            <Link
              href="/play"
              className="btn-ghost w-full sm:w-auto px-6 py-2.5"
            >
              Go to Lobby
            </Link>
          )}
        </div>

        {/* Footer link */}
        <div className="mt-12">
          <p className="text-xs text-ccb-text/30">
            Crazy Chess Battles ·{" "}
            <a
              href="mailto:support@crazychessbattles.live"
              className="text-ccb-primary/60 hover:text-ccb-primary transition-colors"
            >
              support@crazychessbattles.live
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
