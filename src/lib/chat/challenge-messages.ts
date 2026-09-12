import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Challenge links posted into chats are ephemeral. When the challenge is
 * accepted, cancelled, or expires, its chat messages are deleted so nobody
 * taps a dead link ("no longer available") — the message simply vanishes.
 *
 * Matching is on the URL path + challenge id (a UUID), which is unique and
 * contains no LIKE wildcards. Only machine-generated announce/invite
 * messages carry these links, so user-authored messages are untouched.
 *
 * Both helpers are best-effort BY DESIGN: a cleanup failure logs and
 * moves on — it must never block the accept / cancel / refund flow.
 */

export async function removeQuickMatchAnnounceMessages(
  admin: SupabaseClient,
  challengeId: string,
): Promise<void> {
  try {
    const { error } = await admin
      .from("community_messages")
      .delete()
      .ilike("body", `%/challenge/${challengeId}%`);
    if (error) console.error("[challenge-cleanup] room message delete failed:", error.message);
  } catch (e) {
    console.error("[challenge-cleanup] room message delete threw:", e);
  }
}

export async function removeBattleChallengeDMs(
  admin: SupabaseClient,
  challengeId: string,
): Promise<void> {
  try {
    const { error } = await admin
      .from("direct_messages")
      .delete()
      .ilike("body", `%/battle-challenge/${challengeId}%`);
    if (error) console.error("[challenge-cleanup] DM delete failed:", error.message);
  } catch (e) {
    console.error("[challenge-cleanup] DM delete threw:", e);
  }
}
