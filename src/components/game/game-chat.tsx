"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Send } from "lucide-react";

interface ChatMessage {
  senderId: string;
  senderName: string;
  text: string;
  timestamp: number;
}

interface GameChatProps {
  gameId: string;
  currentUserId: string;
  currentUserName: string;
  opponentName: string;
  isSpectator?: boolean;
  isVisible?: boolean;
  onUnreadChange?: (count: number) => void;
}

// Preset quick chat messages (chess.com style)
const QUICK_MESSAGES = [
  "Good move!",
  "Nice game",
  "Good luck!",
  "Well played",
  "Oops 😅",
  "GG",
  "Let's go!",
  "Interesting...",
];

export default function GameChat({ gameId, currentUserId, currentUserName, opponentName, isSpectator, isVisible = true, onUnreadChange }: GameChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [showQuick, setShowQuick] = useState(false);
  const unreadRef = useRef(0);
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>["channel"]> | null>(null);
  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    const channel = supabase.channel(`chat:${gameId}`);

    channel
      .on("broadcast", { event: "message" }, (payload: any) => {
        const msg = payload.payload as ChatMessage;
        if (msg.senderId !== currentUserId) {
          setMessages((prev) => [...prev, msg]);
          if (!isVisibleRef.current) {
            unreadRef.current += 1;
            onUnreadChange?.(unreadRef.current);
          }
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Announce join
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [gameId, currentUserId, supabase]);

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Reset unread count when chat becomes visible
  useEffect(() => {
    if (isVisible && unreadRef.current > 0) {
      unreadRef.current = 0;
      onUnreadChange?.(0);
    }
  }, [isVisible, onUnreadChange]);

  const sendMessage = useCallback((text: string) => {
    if (isSpectator) return; // Spectators can read but not send
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > 500) return;

    const msg: ChatMessage = {
      senderId: currentUserId,
      senderName: currentUserName || "You",
      text: trimmed,
      timestamp: Date.now(),
    };

    // Add to our own list immediately
    setMessages((prev) => [...prev, msg]);
    // If we're sending, we must be viewing the chat — reset unread
    if (unreadRef.current > 0) {
      unreadRef.current = 0;
      onUnreadChange?.(0);
    }

    // Broadcast to others in the channel
    channelRef.current?.send({
      type: "broadcast",
      event: "message",
      payload: msg,
    });

    setInput("");
    setShowQuick(false);
  }, [currentUserId, currentUserName, isSpectator]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-2 py-2 space-y-1.5"
      >
        {messages.length === 0 ? (
          <div className="text-center text-xs text-ccb-muted py-4">
            {isSpectator ? "Spectating — chat is for players only." : `Say something to ${opponentName || "your opponent"}...`}
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.senderId === currentUserId;
            return (
              <div key={idx} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-sm ${
                  isMe
                    ? "bg-ccb-primary text-white"
                    : "bg-ccb-surface text-ccb-text"
                }`}>
                  {!isMe && (
                    <div className="text-[10px] font-medium text-ccb-muted mb-0.5">{msg.senderName}</div>
                  )}
                  <div className="break-words leading-snug">{msg.text}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Quick messages — hidden for spectators */}
      {showQuick && !isSpectator && (
        <div className="px-2 pb-1.5 flex flex-wrap gap-1">
          {QUICK_MESSAGES.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              className="rounded-full bg-ccb-surface border border-ccb-border px-2.5 py-1 text-xs hover:bg-ccb-card transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input — hidden for spectators */}
      {isSpectator ? (
        <div className="flex items-center justify-center gap-1.5 p-2 border-t border-ccb-border shrink-0 text-xs text-ccb-muted">
          <Send className="w-3.5 h-3.5 opacity-50" />
          Spectator mode — listen only
        </div>
      ) : (
        <form onSubmit={handleSend} className="flex items-center gap-1.5 p-2 border-t border-ccb-border shrink-0">
          <button
            type="button"
            onClick={() => setShowQuick(!showQuick)}
            className="shrink-0 text-ccb-muted hover:text-ccb-primary p-1.5 rounded-lg hover:bg-ccb-surface transition-colors"
            title="Quick messages"
          >
            <Send className="w-4 h-4" />
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            maxLength={500}
            placeholder="Type a message..."
            className="flex-1 min-w-0 bg-ccb-surface border border-ccb-border rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:border-ccb-primary"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="shrink-0 bg-ccb-primary text-white rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40 hover:bg-ccb-primary/90 transition-colors"
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
