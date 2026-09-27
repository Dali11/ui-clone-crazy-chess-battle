/**
 * Affiliate commission processing — wraps the process_affiliate_commission
 * RPC (awards the referrer 25% of the referred player's payment) and fires
 * a one-time activation notification when the referral flips
 * pending → activated (the friend's first paid move).
 *
 * Fire-and-forget by design: notification/push failures must never break a
 * payment flow. The RPC itself is the only step callers must see succeed.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendPushToUsers } from "@/lib/push/send";

interface ReferralRow {
  status: string | null;
  referrer_id: string | null;
}

/**
 * Run the commission RPC and notify the referrer on first activation.
 * `amount` is the referred player's payment (MWK-equivalent integer).
 */
export async function processAffiliateCommission(
  admin: SupabaseClient,
  referredUserId: string,
  amount: number
): Promise<void> {
  // Pre-state snapshot: we only celebrate the pending → activated flip,
  // not every recurring commission (each renewal pays 25% again).
  let wasPending = false;
  try {
    const { data: before } = await admin
      .from("referrals")
      .select("status")
      .eq("referred_id", referredUserId)
      .maybeSingle();
    wasPending = !!before && before.status === "pending";
  } catch {}

  const { error } = await admin.rpc("process_affiliate_commission", {
    p_user_id: referredUserId,
    p_amount: Math.round(amount),
  });
  if (error) throw error;

  // Nothing more to do unless this was the activating payment.
  if (!wasPending) return;

  let referrerId: string | null = null;
  try {
    const { data: after } = await admin
      .from("referrals")
      .select("status, referrer_id")
      .eq("referred_id", referredUserId)
      .maybeSingle();
    const active =
      !!after && (after.status === "activated" || after.status === "rewarded");
    if (active && after?.referrer_id) referrerId = after.referrer_id;
  } catch {}
  if (!referrerId) return;

  // Friend's display name for a personal message.
  let friendName = "Your friend";
  try {
    const { data: p } = await admin
      .from("profiles")
      .select("username, display_name")
      .eq("id", referredUserId)
      .single();
    friendName = p?.display_name || p?.username || "Your friend";
  } catch {}

  const title = "Referral activated 🎉";
  const body = `${friendName} just activated — you now earn 25% of every fee they generate, forever. View your team on the affiliate page.`;

  // In-app notification (fire-and-forget).
  try {
    await admin.from("notifications").insert({
      user_id: referrerId,
      type: "referral_activated",
      title,
      body,
      data: { referred_id: referredUserId },
      read: false,
    });
  } catch (e) {
    console.error("[affiliate] activation notification failed:", e);
  }

  // Push — referrers are usually not in the app when this fires.
  try {
    await sendPushToUsers(
      admin,
      [referrerId],
      { title, body, url: "/affiliate", tag: "referral-activated" },
      { notifKey: `referral-activated:${referrerId}`, gapMin: 60 }
    );
  } catch (e) {
    console.error("[affiliate] activation push failed:", e);
  }
}
