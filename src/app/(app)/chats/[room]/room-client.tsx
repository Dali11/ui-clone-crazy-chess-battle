"use client";

// A group chat room (Malawi, Global, ...). Country visibility is enforced
// server-side (API + RLS); an invalid room shows a friendly notice.

import { useEffect, useState } from "react";
import { Globe, MessageCircle } from "lucide-react";
import ChatView from "@/components/chat/chat-view";
import { createClient } from "@/lib/supabase/client";

const ROOM_TITLES: Record<string, string> = {
  malawi: "Crazy Chess Battles Malawi",
  global: "Crazy Chess Battles Global",
};

export default function RoomChatClient({ room }: { room: string }) {
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [roomIcon, setRoomIcon] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setMyUserId(user.id);
      const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
      setIsAdmin(profile?.is_admin === true);
      // Admin-configured room icon (falls back to the platform logo).
      const { data: roomRow } = await supabase
        .from("community_rooms")
        .select("image_url")
        .eq("id", room)
        .maybeSingle();
      setRoomIcon(roomRow?.image_url || null);
    })();
  }, [room]);

  return (
    <div className="max-w-3xl lg:max-w-5xl mx-auto">
      <ChatView
        mode="group"
        room={room}
        headerTitle={ROOM_TITLES[room] || room}
        headerSubtitle={unavailable ? "Not available" : "Official community room"}
        headerIcon={room === "global" ? <Globe className="w-5 h-5" /> : <MessageCircle className="w-5 h-5" />}
        headerAvatarUrl={roomIcon || "/logo-badge.png"}
        myUserId={myUserId}
        isAdmin={isAdmin}
        onUnauthorized={() => setUnavailable(true)}
      />
      {unavailable && (
        <p className="text-xs text-ccb-muted mt-2 text-center">
          This room belongs to another country — you&apos;ll only see your country&apos;s room and the Global room.
        </p>
      )}
    </div>
  );
}
