import type { SupabaseClient } from '@supabase/supabase-js';
import { getPlatformConfig } from '@/lib/platform-config';
import { sendEmail } from '@/lib/email';

/**
 * Creates + activates a CrazyChess Club membership row and notifies the user.
 * Idempotent: safe to call multiple times for the same chargeId (webhook +
 * client poll can race) — returns the existing membership if already created.
 */
export async function activateMembership(
  admin: SupabaseClient,
  userId: string,
  chargeId: string,
  reference: string | null | undefined
) {
  const { data: existing } = await admin
    .from('memberships')
    .select('*')
    .eq('player_id', userId)
    .eq('payment_reference', chargeId)
    .single();
  if (existing) return existing;

  // Load membership config for auto_renew setting
  const mConfig = await getPlatformConfig(admin, 'membership');
  const autoRenew = mConfig.auto_renew === true;

  const billingCycle = reference?.includes('yearly') ? 'yearly' : 'monthly';

  // Read the actual payment amount from the deposit record (source of truth)
  // instead of hardcoding — the membership route uses market_config pricing.
  const { data: dep } = await admin
    .from('deposits')
    .select('amount')
    .eq('charge_id', chargeId)
    .single();
  const price = dep?.amount || (billingCycle === 'yearly' ? 50000 : 5000);

  const now = new Date();
  const endDate = new Date(now);
  if (billingCycle === 'yearly') {
    endDate.setFullYear(endDate.getFullYear() + 1);
  } else {
    endDate.setMonth(endDate.getMonth() + 1);
  }

  const { data: membership, error: membershipError } = await admin
    .from('memberships')
    .insert({
      player_id: userId,
      status: 'active',
      billing_cycle: billingCycle,
      price,
      currency: 'MWK',
      country: 'MW',
      start_date: now.toISOString(),
      end_date: endDate.toISOString(),
      auto_renew: autoRenew,
      payment_method: 'mobile_money',
      payment_reference: chargeId,
    })
    .select()
    .single();

  if (membershipError) {
    // Unique constraint race — another request (webhook vs client verify) created it first
    const { data: raceWinner } = await admin
      .from('memberships')
      .select('*')
      .eq('player_id', userId)
      .eq('payment_reference', chargeId)
      .single();
    if (raceWinner) return raceWinner;
    throw new Error('Payment confirmed but membership activation failed. Contact support.');
  }

  try {
    // Send membership email
    const memProfile = await admin.from('profiles').select('email').eq('id', userId).single();
    if (memProfile.data?.email) {
      await sendEmail({
        to: memProfile.data.email,
        subject: 'Membership is active! 🎟️',
        template: 'membership_activated',
        data: { planName: 'CrazyChess Club', expiresAt: new Date(Date.now() + 30*24*60*60*1000).toLocaleDateString() },
      }).catch(() => {});
    }

    await admin.from('notifications').insert({
      user_id: userId,
      type: 'membership_active',
      title: 'CrazyChess Club Membership Active',
      body: billingCycle === 'yearly'
        ? `Welcome to the CrazyChess Club! Your membership is active for 1 year (until ${endDate.toLocaleDateString()}).`
        : `Welcome to the CrazyChess Club! Your membership is active for 1 month (until ${endDate.toLocaleDateString()}).`,
      data: { billingCycle, membershipId: membership.id },
      read: false,
    });
  } catch {}

  // ─── Trigger affiliate commission (25% of membership fee) ──────
  // The referrer earns 25% of every membership fee the referred user pays,
  // credited directly to their wallet. Ongoing — every renewal pays too.
  try {
    await admin.rpc("process_affiliate_commission", {
      p_user_id: userId,
      p_amount: price,
    });
  } catch (refErr) {
    console.error("Affiliate commission failed:", refErr);
  }

  return membership;
}
