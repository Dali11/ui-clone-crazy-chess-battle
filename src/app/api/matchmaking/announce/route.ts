import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendPushToUsers } from "@/lib/push/send";
import { groupPayload, rulesFromConfig } from "@/lib/push/rules";
import { getPlatformConfig } from "@/lib/platform-config";

// POST /api/matchmaking/announce  { timeControl, rated }
//
// Called in the background by the /play page when a Quick Match search
// finds no immediate opponent. Creates (or reuses) a short-lived challenge
// link and posts it to the player's COUNTRY group room — never the global
// room — so nearby players can tap to start the game. Push notification
// goes to same-country subscribed players, throttled per player.
//
// Dedupe: a player's pending announce challenge (< 10 min old) is reused
// without re-posting, so repeat searches never spam the room.

const TC_MAP: Record<string, { minutes: number; increment: number; base: string; label: string }> = {
  bullet:    { minutes: 1,  increment: 0,  base: "bullet",    label: "Bullet · 1+0" },
  blitz3:    { minutes: 3,  increment: 2,  base: "blitz",    label: "Blitz · 3+2" },
  blitz:     { minutes: 5,  increment: 0,  base: "blitz",    label: "Blitz · 5+0" },
  rapid:     { minutes: 10, increment: 0,  base: "rapid",    label: "Rapid · 10+0" },
  rapid15:   { minutes: 15, increment: 10, base: "rapid",    label: "Rapid · 15+10" },
  classical: { minutes: 30, increment: 0,  base: "classical", label: "Classical · 30+0" },
};

const ANNOUNCE_SOURCE = "quick_match_announce";
const LINK_WINDOW_MIN = 10; // matches the challenge expiry used for announces

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const tc = TC_MAP[body?.timeControl] || TC_MAP.blitz;
    const rated = body?.rated !== false; // default true, same as queue join

    const admin = createAdminClient();

    // ── Reuse a still-pending announce challenge (no duplicate links, no reposts) ──
    const { data: pending } = await admin
      .from("challenges")
      .select("id, expires_at")
      .eq("challenger_id", user.id)
      .eq("source", ANNOUNCE_SOURCE)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    const now = new Date();
    let challengeId: string;

    if (pending && pending.length > 0) {
      challengeId = pending[0].id;
      return NextResponse.json({ challengeId, url: buildUrl(challengeId), posted: false, reused: true });
    }

    // ── Create the announce challenge (short-lived link) ──
    const { data: challenge, error: chErr } = await admin
      .from("challenges")
      .insert({
        challenger_id: user.id,
        time_control: body?.timeControl || "blitz",
        initial_minutes: tc.minutes,
        increment_seconds: tc.increment,
        rated,
        color: "random",
        status: "pending",
        source: ANNOUNCE_SOURCE,
        expires_at: new Date(now.getTime() + LINK_WINDOW_MIN * 60 * 1000).toISOString(),
      })
      .select("id")
      .single();

    if (chErr || !challenge) return NextResponse.json({ error: "Failed to create challenge" }, { status: 500 });
    challengeId = challenge.id;
    const url = buildUrl(challengeId);

    // ── Player profile + country room ──
    const { data: profile } = await admin
      .from("profiles")
      .select("country, username, display_name, rating, avatar_url, referral_code")
      .eq("id", user.id)
      .single();

    if (!profile?.country) {
      return NextResponse.json({ challengeId, url, posted: false, reason: "no_country" });
    }

    const { data: room } = await admin
      .from("community_rooms")
      .select("id, country")
      .eq("country", profile.country)
      .limit(1)
      .single();

    if (!room) {
      return NextResponse.json({ challengeId, url, posted: false, reason: "no_room" });
    }

    // ── Post the invite into the country room, as the player ──
    const name = profile.display_name || profile.username || "a player";
    const tcLabel = TC_MAP[body?.timeControl]?.label || tc.label;
    const msg =
      `♟️ ${name} is looking for a Quick Match — ${tcLabel} ` +
      `(${rated ? "Ranked" : "Casual"}${profile.rating ? `, rating ${profile.rating}` : ""}). ` +
      `Tap to play: ${url}`;

    const { error: msgErr } = await admin.from("community_messages").insert({
      room: room.id,
      user_id: user.id,
      username: profile.username || "player",
      avatar_url: profile.avatar_url || null,
      body: msg.slice(0, 500),
    });
    if (msgErr) return NextResponse.json({ challengeId, url, posted: false, reason: "post_failed" });

    // ── Push to same-country subscribed players (throttled, never blocks) ──
    try {
      const { data: locals } = await admin.from("profiles").select("id").eq("country", profile.country);
      const targets = (locals || []).map((r: any) => r.id).filter((id: string) => id !== user.id);
      if (targets.length) {
        let rules = rulesFromConfig(null);
        try { rules = rulesFromConfig(await getPlatformConfig(admin, "push")); } catch {}
        await sendPushToUsers(
          admin,
          targets,
          groupPayload(room.id, name, `Looking for a Quick Match (${tcLabel}) — tap the group to play ♟️`),
          // One announce push per player per gap window, across ALL announcers —
          // someone spamming search can never spam players' phones.
          { notifKey: "matchmaking:announce", gapMin: rules.group_gap_min, rules }
        );
      }
    } catch {}

    return NextResponse.json({ challengeId, url, posted: true, room: room.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed to announce match" }, { status: 500 });
  }
}

function buildUrl(challengeId: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://crazychessbattles.live";
  return `${base}/challenge/${challengeId}`;
}
