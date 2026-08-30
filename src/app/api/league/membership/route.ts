import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";

// GET — Check membership status and pricing (now from market_config table)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Get membership pricing from platform settings (admin-configurable)
    const mConfig = await getPlatformConfig(admin, 'membership');

    const membershipConfig = {
      currency: mConfig.currency || 'MWK',
      price: mConfig.monthly_price || 10000,
      yearlyPrice: mConfig.yearly_price || (mConfig.monthly_price || 10000) * 10,
      billingCycle: 'monthly',
      active: mConfig.membership_active !== false,
      benefits: [
        'Access to premium Premier League competitions',
        'Priority entry to Swiss qualifier tournaments',
        'Official CrazyChess Club ranking',
        'Season points accumulation',
        'Exclusive tournament invitations',
        'Verified player badge',
      ],
    };

    let membership: any = null;
    if (user) {
      const { data: activeMembership } = await admin
        .from('memberships')
        .select('*')
        .eq('player_id', user.id)
        .eq('status', 'active')
        .gt('end_date', new Date().toISOString())
        .order('end_date', { ascending: false })
        .limit(1)
        .single();
      membership = activeMembership;

      const { data: history } = await admin
        .from('memberships')
        .select('*')
        .eq('player_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      return NextResponse.json({
        success: true,
        config: membershipConfig,
        membership,
        history: history || [],
        hasActiveMembership: !!membership,
      });
    }

    return NextResponse.json({
      success: true,
      config: membershipConfig,
      membership: null,
      hasActiveMembership: false,
    });
  } catch (error: any) {
    console.error('Membership API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — Initiate membership subscription payment via PayChangu
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'You must be logged in to subscribe' }, { status: 401 });
    }

    const { billingCycle = 'monthly', phone, operatorRefId, email, firstName, lastName } = await request.json();

    if (!phone || !operatorRefId) {
      return NextResponse.json({ error: 'Phone number and payment operator are required' }, { status: 400 });
    }

    // ─── Load platform config for membership ──────────────────────
    const mConfig = await getPlatformConfig(admin, 'membership');

    // Enforce verification requirement if enabled
    if (mConfig.require_verification) {
      const { data: profile } = await admin
        .from('profiles')
        .select('identity_verified')
        .eq('id', user.id)
        .single();
      if (!profile?.identity_verified) {
        return NextResponse.json({ error: 'Identity verification required to purchase membership. Please contact an admin to get verified.' }, { status: 403 });
      }
    }

    // Get pricing from platform settings (admin-configurable, already loaded above)
    const monthlyPrice = mConfig.monthly_price || 10000;
    const yearlyPrice = mConfig.yearly_price || monthlyPrice * 10;
    const price = billingCycle === 'yearly' ? yearlyPrice : monthlyPrice;
    const currency = mConfig.currency || 'MWK';
    const country = (mConfig.country || 'MW') as string;

    // Check for existing active membership
    const { data: existing } = await admin
      .from('memberships')
      .select('*')
      .eq('player_id', user.id)
      .eq('status', 'active')
      .gt('end_date', new Date().toISOString())
      .single();

    if (existing) {
      return NextResponse.json({
        error: 'You already have an active membership',
        membership: existing,
      }, { status: 400 });
    }

    const chargeId = `ccb_membership_${Date.now()}_${user.id.slice(0, 8)}`;
    const { data: deposit, error: depositError } = await admin
      .from('deposits')
      .insert({
        user_id: user.id,
        amount: price,
        method: 'mobile_money',
        status: 'pending',
        charge_id: chargeId,
        phone,
        operator: operatorRefId,
        reference: `membership:${billingCycle}`,
      })
      .select('id')
      .single();

    if (depositError || !deposit) {
      return NextResponse.json({ error: 'Failed to create payment record' }, { status: 500 });
    }

    // Initiate PayChangu mobile money payment
    const amount = price.toString();
    const res = await fetch('https://api.paychangu.com/mobile-money/payments/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mobile: phone,
        mobile_money_operator_ref_id: operatorRefId,
        amount,
        charge_id: chargeId,
        email: email || undefined,
        first_name: firstName || undefined,
        last_name: lastName || undefined,
      }),
    });

    const data = await res.json();

    if (!res.ok || data.error || data.status === 'failed') {
      await admin.from('deposits')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', deposit.id);

      const safeError = data.status === 'failed'
        ? 'Payment request failed. Please check your phone number and try again.'
        : 'Unable to initiate payment. Please try again later.';
      return NextResponse.json({ error: safeError }, { status: 400 });
    }

    if (data.reference || data.tx_ref) {
      await admin.from('deposits')
        .update({ paychangu_ref: data.reference || data.tx_ref })
        .eq('id', deposit.id);
    }

    return NextResponse.json({
      success: true,
      depositId: deposit.id,
      chargeId,
      status: data.status || 'pending',
      message: data.message || 'Check your phone to authorize the payment',
    });
  } catch (error: any) {
    console.error('Membership payment error:', error);
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 });
  }
}
