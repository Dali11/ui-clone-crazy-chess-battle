import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { activateMembership } from '@/lib/league/membership';

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

    // Already marked success (e.g. the webhook won the race) — auto-activate
    // the membership here too if it hasn't been created yet.
    if (deposit.status === 'success') {
      try {
        const membership = await activateMembership(admin, user.id, chargeId, deposit.reference);
        return NextResponse.json({
          status: 'success',
          depositId: deposit.id,
          membership,
          message: `Welcome to the CrazyChess Club! Your membership is active.`,
        });
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
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
        // Another request (webhook or a concurrent verify call) is already
        // processing or has finished — try to activate here too in case that
        // other request hasn't created the membership row yet.
        try {
          const membership = await activateMembership(admin, user.id, chargeId, deposit.reference);
          return NextResponse.json({
            status: 'success',
            depositId: deposit.id,
            membership,
            message: `Welcome to the CrazyChess Club! Your membership is active.`,
          });
        } catch {
          return NextResponse.json({ status: 'success', depositId: deposit.id, message: 'Payment confirmed, activating...' });
        }
      }

      let membership;
      try {
        membership = await activateMembership(admin, user.id, chargeId, deposit.reference);
      } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }

      // Mark deposit as success (skip wallet credit — this is a membership payment, not a deposit)
      await admin.from('deposits')
        .update({ status: 'success', updated_at: new Date().toISOString() })
        .eq('id', deposit.id);

      return NextResponse.json({
        status: 'success',
        depositId: deposit.id,
        membership,
        message: membership.billing_cycle === 'yearly'
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
