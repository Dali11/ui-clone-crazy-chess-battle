// Push notification rules — PURE, no I/O (unit-tested).
// The sender (send.ts) owns delivery + storage; this module owns WHAT we
// notify about, the payload shape, and per-user throttle decisions.

export interface PushPayload {
  title: string;
  body: string;
  url: string;   // deep link opened on tap
  tag: string;   // Android/chrome collapse key — same tag replaces, stacks visually
}

export interface PushRules {
  dm_gap_min: number;      // min minutes between DM notifications per sender:recipient pair
  group_gap_min: number;   // per room
  turn_gap_min: number;    // per game
}

export const DEFAULT_PUSH_RULES: PushRules = {
  dm_gap_min: 0,
  group_gap_min: 10,
  turn_gap_min: 5,
};

export function rulesFromConfig(cfg: Record<string, any> | null | undefined): PushRules {
  if (!cfg) return DEFAULT_PUSH_RULES;
  const num = (k: keyof PushRules) => {
    const v = Number(cfg[k]);
    return Number.isFinite(v) && v >= 0 ? v : DEFAULT_PUSH_RULES[k];
  };
  return { dm_gap_min: num("dm_gap_min"), group_gap_min: num("group_gap_min"), turn_gap_min: num("turn_gap_min") };
}

// Throttle decision: has enough time passed since the last notification
// with this key? gap 0 = always notify (log still updates).
export function throttled(lastSentAtIso: string | null | undefined, gapMin: number, nowMs = Date.now()): boolean {
  if (!lastSentAtIso) return false;
  const t = Date.parse(lastSentAtIso);
  if (!Number.isFinite(t)) return false;
  return nowMs - t < gapMin * 60_000;
}

// ─── Payload builders (keep bodies short; push payloads must stay tiny) ───

function preview(text: string, len = 90): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > len ? t.slice(0, len - 1) + "…" : t;
}

export function dmPayload(fromUsername: string, body: string, senderId: string): PushPayload {
  return {
    title: fromUsername || "New message",
    body: body ? preview(body) : "Sent you a message",
    url: `/chats/dm/${senderId}`,
    tag: `dm-${senderId}`,
  };
}

export function groupPayload(room: string, fromUsername: string, body: string): PushPayload {
  return {
    title: `${fromUsername || "Someone"} · ${room === "malawi" ? "Malawi" : room === "global" ? "Global" : room}`,
    body: body ? preview(body) : "New message in the group",
    url: `/chats/${room}`,
    tag: `group-${room}`,
  };
}

export function turnPayload(gameId: string, opponentName: string): PushPayload {
  return {
    title: "Your move",
    body: opponentName ? `It's your turn vs ${opponentName}` : "It's your turn",
    url: `/game/${gameId}`,
    tag: `turn-${gameId}`,
  };
}

export function challengeAcceptedPayload(acceptorName: string): PushPayload {
  return {
    title: "Battle accepted! ⚔️",
    body: acceptorName ? `${acceptorName} accepted your challenge — your game is live` : "Your challenge was accepted — your game is live",
    url: "/dashboard",
    tag: "challenge-accepted",
  };
}

// Free Quick Match challenge accepted — deep-links straight to the board.
// The challenger may be away from the app; clocks wait for them (join window).
export function quickMatchAcceptedPayload(gameId: string, acceptorName: string): PushPayload {
  return {
    title: "Match accepted! ♟️",
    body: `${acceptorName} accepted your Quick Match — get to the board, clocks wait 2 minutes!`,
    url: `/game/${gameId}`,
    tag: `quick-match-${gameId}`,
  };
}

// Friend request received
export function friendRequestPayload(fromUsername: string, senderId: string): PushPayload {
  return {
    title: "New friend request 👥",
    body: fromUsername ? `${fromUsername} wants to be your friend` : "Someone wants to be your friend",
    url: "/friends",
    tag: `friend-request-${senderId}`,
  };
}

// Friend request accepted
export function friendAcceptedPayload(acceptorName: string, acceptorId: string): PushPayload {
  return {
    title: "Friend request accepted 🎉",
    body: acceptorName ? `${acceptorName} is now your friend — challenge them anytime!` : "You have a new friend",
    url: "/friends",
    tag: `friend-accepted-${acceptorId}`,
  };
}

// Suppress turn notifications while the opponent is actively on the game
// (their heartbeat updates last_seen every few seconds).
export const TURN_ACTIVE_SUPPRESS_MS = 90_000;

export function opponentRecentlyActive(lastSeenIso: string | null | undefined, nowMs = Date.now()): boolean {
  if (!lastSeenIso) return false;
  const t = Date.parse(lastSeenIso);
  if (!Number.isFinite(t)) return false;
  return nowMs - t < TURN_ACTIVE_SUPPRESS_MS;
}
