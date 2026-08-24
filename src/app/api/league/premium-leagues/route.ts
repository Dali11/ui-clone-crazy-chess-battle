import { createAdminClient } from '@/lib/supabase/admin';
import { getMarketConfig } from '@/lib/league/market-config';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();

    // Get user
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token).catch(() => ({ data: { user: null } }));

    let isAdmin = false;
    let userCountry: string | null = null;

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin, country')
        .eq('id', user.id)
        .single();
      isAdmin = !!profile?.is_admin;
      userCountry = profile?.country || null;
    }

    const market = await getMarketConfig(userCountry);

    // Fetch all 5 leagues ordered by tier
    const { data: leagues, error } = await supabase
      .from('premier_leagues')
      .select(`
        id, name, status, country, league_size, tier, gender_restriction,
        entry_type, promotes_count, relegates_count, qualifying_positions,
        prize_pool_cents, prize_currency, season_duration_weeks, payout_config,
        current_matchday, total_matchdays, player_ids,
        sponsor_name, sponsor_logo_url, description, banner_url
      `)
      .order('tier', { ascending: true });

    if (error) throw error;

    // For each league, get standings if active
    const leaguesWithStandings = await Promise.all(
      (leagues || []).map(async (league: any) => {
        let standings: any[] = [];
        let registrationCount = 0;
        let playerCount = league.player_ids?.length || 0;

        // Get registration count
        const { count } = await supabase
          .from('league_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('league_id', league.id)
          .in('status', ['pending', 'approved']);

        registrationCount = count || 0;

        // Get standings if league is active
        if (league.status === 'active' || league.status === 'completed') {
          const { data: standingRows } = await supabase
            .from('league_standings')
            .select(`
              position, played, wins, draws, losses, points, form,
              player_id, player:profiles!league_standings_player_id_fkey(id, username, display_name, avatar_url, rating)
            `)
            .eq('league_id', league.id)
            .order('position', { ascending: true })
            .limit(20);

          standings = standingRows || [];
        }

        return {
          ...league,
          playerCount,
          registrationCount,
          standings,
          prizePool: league.prize_pool_cents,
          prizeCurrency: league.prize_currency,
          capacity: league.league_size,
          promotesCount: league.promotes_count,
          relegatesCount: league.relegates_count,
          qualifyingPositions: league.qualifying_positions,
          seasonDurationWeeks: league.season_duration_weeks,
          payoutConfig: league.payout_config,
        };
      })
    );

    // Check user's membership status
    let hasMembership = false;
    if (user) {
      const { data: membership } = await supabase
        .from('memberships')
        .select('id, status, end_date')
        .eq('player_id', user.id)
        .eq('status', 'active')
        .gt('end_date', new Date().toISOString())
        .order('end_date', { ascending: false })
        .limit(1)
        .single();
      hasMembership = !!membership;
    }

    return NextResponse.json({
      success: true,
      isAdmin,
      hasMembership,
      market: {
        currencyCode: market.currencyCode,
        currencySymbol: market.currencySymbol,
        membershipPrice: market.membershipPriceCents,
        membershipActive: market.membershipActive,
      },
      leagues: leaguesWithStandings,
    });
  } catch (error: any) {
    console.error('Premium leagues API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
