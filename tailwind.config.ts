import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ccb: {
          dark: "#0a0a0f",
          // Alias for "dark" — several components (advertise forms,
          // creative previews, friends page) reference bg-ccb-bg. It was
          // never in this palette, so Tailwind silently dropped the
          // class and those panels rendered fully transparent.
          bg: "#0a0a0f",
          surface: "#16161f",
          card: "#1c1c28",
          border: "#2a2a3a",
          primary: "#7c3aed",
          primaryHover: "#6d28d9",
          accent: "#f59e0b",
          gold: "#fbbf24",
          silver: "#94a3b8",
          bronze: "#b45309",
          success: "#10b981",
          danger: "#ef4444",
          muted: "#9ca3af",
          text: "#ffffff",
          // Aliases for "text" — same undefined-color bug as ccb-bg above.
          fg: "#ffffff",
          foreground: "#ffffff",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-in",
        "slide-up": "slideUp 0.3s ease-out",
        "pulse-glow": "pulseGlow 2s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { transform: "translateY(10px)", opacity: "0" }, "100%": { transform: "translateY(0)", opacity: "1" } },
        pulseGlow: { "0%, 100%": { boxShadow: "0 0 5px rgba(124, 58, 237, 0.3)" }, "50%": { boxShadow: "0 0 20px rgba(124, 58, 237, 0.6)" } },
      },
    },
  },
  plugins: [],
};

export default config;
