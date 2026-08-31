"use client";

import { ErrorPage } from "@/components/error-page";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // global-error must render its own <html> and <body> since the root
  // layout is what crashed. We inline minimal styles so this works even
  // if the Tailwind stylesheet fails to load.
  return (
    <html lang="en">
      <body style={{ margin: 0, backgroundColor: "#0a0a0f", color: "#fff", fontFamily: "Inter, system-ui, sans-serif" }}>
        <style>{`
          @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
          .animate-fade-in { animation: fadeIn 0.3s ease-in; }
          @keyframes pulse { 0%,100% { opacity:1 } 50% { opacity:0.5 } }
          .animate-pulse { animation: pulse 2s ease-in-out infinite; }
          .btn-primary {
            display: inline-flex; align-items: center; justify-content: center;
            border-radius: 8px; padding: 10px 24px; font-size: 14px; font-weight: 500;
            background: #7c3aed; color: #fff; border: none; cursor: pointer;
            transition: background 0.2s; text-decoration: none;
          }
          .btn-primary:hover { background: #6d28d9; }
          .btn-secondary {
            display: inline-flex; align-items: center; justify-content: center;
            border-radius: 8px; padding: 10px 24px; font-size: 14px; font-weight: 500;
            background: #1c1c28; color: #fff; border: 1px solid #2a2a3a; cursor: pointer;
            transition: background 0.2s; text-decoration: none;
          }
          .btn-secondary:hover { background: #16161f; }
          .btn-ghost {
            display: inline-flex; align-items: center; justify-content: center;
            border-radius: 8px; padding: 10px 24px; font-size: 14px; font-weight: 500;
            background: transparent; color: #9ca3af; border: none; cursor: pointer;
            text-decoration: none;
          }
          .btn-ghost:hover { color: #fff; }
        `}</style>
        <div style={{ position: "relative", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem", overflow: "hidden" }}>
          {/* Ambient glow */}
          <div style={{ position: "absolute", top: "25%", left: "50%", transform: "translateX(-50%)", width: 600, height: 600, borderRadius: "50%", background: "rgba(124,58,237,0.08)", filter: "blur(120px)", pointerEvents: "none" }} />
          {/* Grid pattern */}
          <div style={{ position: "absolute", inset: 0, opacity: 0.03, backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none" }} />
          <div className="animate-fade-in" style={{ position: "relative", zIndex: 10, textAlign: "center", maxWidth: 400, width: "100%" }}>
            <div style={{ position: "relative", display: "inline-block", marginBottom: 32 }}>
              <div style={{ position: "absolute", inset: 0, background: "rgba(124,58,237,0.2)", filter: "blur(40px)", borderRadius: "50%" }} />
              <div style={{ position: "relative", fontSize: 80, lineHeight: 1, userSelect: "none", filter: "drop-shadow(0 0 25px rgba(124,58,237,0.35))" }}>♚</div>
            </div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, borderRadius: 999, background: "#1c1c28", border: "1px solid #2a2a3a", padding: "6px 16px", marginBottom: 24 }}>
              <span className="animate-pulse" style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444" }} />
              <span style={{ fontSize: 12, fontFamily: "monospace", letterSpacing: "0.05em", color: "#9ca3af" }}>ERROR 500</span>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 12 }}>Critical error</h1>
            <p style={{ fontSize: 14, color: "#9ca3af", marginBottom: 8, maxWidth: 280, marginLeft: "auto", marginRight: "auto" }}>
              The app hit a fatal error. Try reloading — if it persists, contact support.
            </p>
            {error?.digest && (
              <p style={{ fontSize: 12, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", marginBottom: 24 }}>ref: {error.digest}</p>
            )}
            {!error?.digest && <div style={{ marginBottom: 24 }} />}
            <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
              <button onClick={reset} className="btn-primary" style={{ width: "100%" }}>Try Again</button>
              <a href="/" className="btn-secondary" style={{ width: "100%" }}>Back to Home</a>
            </div>
            <div style={{ marginTop: 48 }}>
              <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
                Crazy Chess Battles · <a href="mailto:support@crazychessbattles.live" style={{ color: "rgba(124,58,237,0.6)" }}>support@crazychessbattles.live</a>
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
