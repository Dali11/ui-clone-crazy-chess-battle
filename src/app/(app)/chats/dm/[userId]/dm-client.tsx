"use client";

// A direct-message thread with one player, WhatsApp-style with read ticks.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import ChatView from "@/components/chat/chat-view";
import { createClient } from "@/lib/supabase/client";

const AVATAR_COLORS = [
  "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-lime-600",
  "bg-emerald-600", "bg-teal-600", "bg-sky-600", "bg-indigo-500",
  "bg-violet-500", "bg-fuchsia-500", "bg-pink-500", "bg-rose-500",
];
function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export default function DmChatClient({ partnerId }: { partnerId: string }) {
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [partner, setPartner] = useState<{ username: string } | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyUserId(user.id);
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", partnerId)
        .single();
      setPartner(profile || { username: "player" });
    })();
  }, [partnerId]);

  return (
    <div className="max-w-3xl mx-auto">
      <Link href="/chats" className="inline-flex items-center gap-1 text-xs text-ccb-muted hover:text-ccb-text mb-1">
        <ArrowLeft className="w-3.5 h-3.5" /> All chats
      </Link>
      {partner ? (
        <ChatView
          mode="dm"
          partnerId={partnerId}
          headerTitle={partner.username}
          headerSubtitle="Direct message"
          headerIcon={
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${colorFor(partner.username)}`}>
              {partner.username?.[0]?.toUpperCase() || "?"}
            </span>
          }
          myUserId={myUserId}
        />
      ) : (
        <div className="h-[50vh] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-ccb-muted" />
        </div>
      )}
    </div>
  );
}
