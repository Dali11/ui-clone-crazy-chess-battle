"use client";

import { useState, useEffect } from "react";
import { X, Users } from "lucide-react";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";

const WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/Jn1pLCUVbv09ECOiS8UM1o";
const JOINED_KEY = "ccb-wa-joined";
const LAST_SHOWN_KEY = "ccb-wa-last-shown";

export default function WhatsAppBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if user already joined
    const joined = localStorage.getItem(JOINED_KEY);
    if (joined === "true") return;

    // Show once per day
    const today = new Date().toDateString();
    const lastShown = localStorage.getItem(LAST_SHOWN_KEY);
    if (lastShown === today) return;

    // Show it!
    setVisible(true);
    localStorage.setItem(LAST_SHOWN_KEY, today);
  }, []);

  const handleJoin = () => {
    window.open(WHATSAPP_GROUP_URL, "_blank", "noopener,noreferrer");
  };

  const handleJoined = () => {
    localStorage.setItem(JOINED_KEY, "true");
    setVisible(false);
  };

  const handleDismiss = () => {
    // Just hide for today — will show again tomorrow
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-green-500/5 to-ccb-surface p-4">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-2 p-1 text-ccb-muted hover:text-ccb-text transition-colors"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-[#25D366] flex items-center justify-center shrink-0">
          <WhatsAppIcon className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm flex items-center gap-1.5">
            Join our WhatsApp Group
            <Users className="w-3.5 h-3.5 text-emerald-400" />
          </h3>
          <p className="text-xs text-ccb-muted mt-0.5">
            Connect with players, get match updates, and join exclusive tournaments.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3">
        <button
          onClick={handleJoin}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-[#25D366] hover:bg-[#1da851] text-white text-sm font-semibold px-4 py-2.5 transition-colors"
        >
          <WhatsAppIcon className="w-4 h-4" />
          <span>Join Group</span>
        </button>
        <button
          onClick={handleJoined}
          className="rounded-lg border border-ccb-border bg-ccb-surface hover:bg-ccb-card text-ccb-muted hover:text-ccb-text text-sm font-medium px-4 py-2.5 transition-colors"
        >
          I've Joined
        </button>
      </div>
    </div>
  );
}
