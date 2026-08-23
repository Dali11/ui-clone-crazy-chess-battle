import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// GET — Check membership status and pricing
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Get membership config (from memberships table or hardcoded defaults)
    // In production this would come from a market_config table
    const membershipConfig = {
      country: 'MW',
      currency: 'MWK',
      price: 5000,
      billingCycle: 'monthly',
      active: true,
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

      // Get membership history
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

// POST — Create a membership subscription
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'You must be logged in to subscribe' }, { status: 401 });
    }

    const { billingCycle = 'monthly', paymentMethod, paymentReference } = await request.json();

    // Pricing config
    const price = billingCycle === 'yearly' ? 50000 : 5000; // Yearly = 10 months (2 months free)
    const currency = 'MWK';
    const country = 'MW';

    const now = new Date();
    const endDate = new Date(now);
    if (billingCycle === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    // Check for existing active membership
    const { data: existing } = await admin
      .from('memberships')
      .select('*')
      .eq('player_id', user.id)
      .eq('status', 'active')
      .gt('end_date', now.toISOString())
      .single();

    if (existing) {
      return NextResponse.json({
        error: 'You already have an active membership',
        membership: existing,
      }, { status: 400 });
    }

    // Create membership
    const { data: membership, error } = await admin
      .from('memberships')
      .insert({
        player_id: user.id,
        status: 'active',
        billing_cycle: billingCycle,
        price,
        currency,
        country,
        start_date: now.toISOString(),
        end_date: endDate.toISOString(),
        auto_renew: false,
        payment_method: paymentMethod || 'mobile_money',
        payment_reference: paymentReference || null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      membership,
      message: billingCycle === 'yearly'
        ? `Welcome to the CrazyChess Club! Your membership is active for 1 year (until ${endDate.toLocaleDateString()}).`
        : `Welcome to the CrazyChess Club! Your membership is active for 1 month (until ${endDate.toLocaleDateString()}).`,
    });
  } catch (error: any) {
    console.error('Create membership error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
