import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// POST — Verify membership payment status and activate membership on success
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { chargeId } = await request.json();
    if (!chargeId) {
      return NextResponse.json({ error: 'Charge ID required' }, { status: 400 });
    }

    // Find the deposit record
    const { data: deposit } = await admin
      .from('deposits')
      .select('id, user_id, amount_cents, status, reference, phone, operator')
      .eq('charge_id', chargeId)
      .single();

    if (!deposit) {
      return NextResponse.json({ error: 'Payment record not found' }, { status: 404 });
    }
    if (deposit.user_id !== user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Already processed
    if (deposit.status === 'success') {
      // Check if membership was already activated
      const { data: existingMembership } = await admin
        .from('memberships')
        .select('*')
        .eq('player_id', user.id)
        .eq('payment_reference', chargeId)
        .single();

      return NextResponse.json({
        status: 'success',
        depositId: deposit.id,
        membership: existingMembership || null,
        message: existingMembership ? 'Membership activated' : 'Payment confirmed, activating membership...',
      });
    }

    if (deposit.status === 'failed' || deposit.status === 'cancelled') {
      return NextResponse.json({ status: 'failed', depositId: deposit.id });
    }

    // pending or processing — verify with PayChangu
    const verifyUrl = `https://api.paychangu.com/mobile-money/payments/${chargeId}/verify`;
    const res = await fetch(verifyUrl, {
      headers: {
        Authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
        Accept: 'application/json',
      },
    });

    const data = await res.json();
    const remoteStatus = data.data?.status || data.status;

    if (remoteStatus === 'success' || remoteStatus === 'successful') {
      // Atomically claim from pending to processing
      const { data: claimed } = await admin
        .from('deposits')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', deposit.id)
        .eq('status', 'pending')
        .select('id');

      if (!claimed || claimed.length === 0) {
        // Another request is already processing
        return NextResponse.json({ status: 'success', depositId: deposit.id, message: 'Payment confirmed, activating...' });
      }

      // Parse billing cycle from reference: "membership:monthly" or "membership:yearly"
      const billingCycle = deposit.reference?.includes('yearly') ? 'yearly' : 'monthly';
      const price = billingCycle === 'yearly' ? 50000 : 5000;

      const now = new Date();
      const endDate = new Date(now);
      if (billingCycle === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }

      // Create the active membership
      const { data: membership, error: membershipError } = await admin
        .from('memberships')
        .insert({
          player_id: user.id,
          status: 'active',
          billing_cycle: billingCycle,
          price,
          currency: 'MWK',
          country: 'MW',
          start_date: now.toISOString(),
          end_date: endDate.toISOString(),
          auto_renew: false,
          payment_method: 'mobile_money',
          payment_reference: chargeId,
        })
        .select()
        .single();

      if (membershipError) {
        console.error('Failed to create membership:', membershipError);
        return NextResponse.json({ error: 'Payment confirmed but membership activation failed. Contact support.' }, { status: 500 });
      }

      // Mark deposit as success (skip wallet credit — this is a membership payment, not a deposit)
      await admin.from('deposits')
        .update({ status: 'success', updated_at: new Date().toISOString() })
        .eq('id', deposit.id);

      // Notify user
      try {
        await admin.from('notifications').insert({
          user_id: user.id,
          type: 'membership_active',
          title: 'CrazyChess Club Membership Active',
          body: billingCycle === 'yearly'
            ? `Welcome to the CrazyChess Club! Your membership is active for 1 year (until ${endDate.toLocaleDateString()}).`
            : `Welcome to the CrazyChess Club! Your membership is active for 1 month (until ${endDate.toLocaleDateString()}).`,
          data: { billingCycle, membershipId: membership.id },
          read: false,
        });
      } catch {}

      return NextResponse.json({
        status: 'success',
        depositId: deposit.id,
        membership,
        message: billingCycle === 'yearly'
          ? `Welcome to the CrazyChess Club! Your membership is active for 1 year.`
          : `Welcome to the CrazyChess Club! Your membership is active for 1 month.`,
      });
    }

    if (remoteStatus === 'failed' || remoteStatus === 'cancelled') {
      await admin.from('deposits')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', deposit.id);
      return NextResponse.json({ status: 'failed', depositId: deposit.id });
    }

    return NextResponse.json({ status: remoteStatus || 'pending', depositId: deposit.id });
  } catch (error: any) {
    console.error('Membership verify error:', error);
    return NextResponse.json({ error: 'Verification failed. Please try again.' }, { status: 500 });
  }
}
