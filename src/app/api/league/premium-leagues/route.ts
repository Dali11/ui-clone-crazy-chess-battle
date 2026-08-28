import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getMarketConfig } from '@/lib/league/market-config';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();

    let isAdmin = false;
    let profile: any = null;

    if (user) {
      const { data: profileData } = await admin
        .from('profiles')
        .select('id, is_admin, country, full_name, display_name, gender, rating, phone_verified, identity_verified, chesscom_verified, games_played, account_created_at, created_at')
        .eq('id', user.id)
        .single();
      profile = profileData;
      isAdmin = !!profile?.is_admin;
    }

    const market = await getMarketConfig(profile?.country);

    const { data: leagues, error } = await admin
      .from('premier_leagues')
      .select(`
        id, name, status, country, league_size, tier, gender_restriction,
        entry_type, promotes_count, relegates_count, qualifying_positions,
        prize_pool, prize_currency, season_duration_weeks, payout_config,
        current_matchday, total_matchdays, player_ids,
        sponsor_name, sponsor_logo_url, description, banner_url,
        min_rating, max_rating, min_games_played, min_account_age_days,
        requires_phone_verification, requires_identity_verification, requires_chesscom_verification,
        registration_deadline
      `)
      .order('tier', { ascending: true });

    if (error) throw error;

    let hasMembership = false;
    if (user) {
      const { data: membership } = await admin
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

    const leaguesWithStandings = await Promise.all(
      (leagues || []).map(async (league: any) => {
        let standings: any[] = [];
        let registrationCount = 0;
        const playerCount = league.player_ids?.length || 0;

        const { count } = await admin
          .from('league_registrations')
          .select('*', { count: 'exact', head: true })
          .eq('league_id', league.id)
          .in('status', ['pending', 'approved']);
        registrationCount = count || 0;

        if (league.status === 'active' || league.status === 'completed') {
          const { data: standingRows } = await admin
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

        // Build qualification info
        let qualification: any = { canJoin: false, reason: 'not_authenticated', isRegistered: false, checklist: null, regStatus: null };

        if (user) {
          const isPlayer = league.player_ids?.includes(user.id);
          const { data: existingReg } = await admin
            .from('league_registrations')
            .select('id, status')
            .eq('league_id', league.id)
            .eq('player_id', user.id)
            .single();

          if (isPlayer) {
            qualification = { canJoin: false, reason: 'already_joined', isRegistered: true, checklist: null, regStatus: 'player' };
          } else if (existingReg) {
            qualification = { canJoin: false, reason: 'already_registered', isRegistered: true, checklist: null, regStatus: existingReg.status };
          } else if (league.status === 'completed') {
            qualification = { canJoin: false, reason: 'completed', isRegistered: false, checklist: null, regStatus: null };
          } else if (league.status !== 'registration') {
            qualification = { canJoin: false, reason: 'not_registration_phase', isRegistered: false, checklist: null, regStatus: null };
          } else {
            const accountAge = profile ? Math.floor(
              (Date.now() - new Date(profile.account_created_at || profile.created_at || Date.now()).getTime()) / (1000 * 60 * 60 * 24)
            ) : 0;

            const checklist = [
              { id: 'profile_complete', label: 'Complete your profile', done: !!(profile?.full_name && profile?.display_name && profile?.country), required: true, action: '/settings', actionLabel: 'Edit Profile' },
              { id: 'gender_selected', label: 'Select your gender', done: !!profile?.gender, required: true, action: '/settings', actionLabel: 'Set Gender' },
              {
                id: 'gender_requirement',
                label: `Gender: ${league.gender_restriction || 'open'} division`,
                done: !league.gender_restriction || league.gender_restriction === 'open' || (profile?.gender === league.gender_restriction && !!profile?.identity_verified),
                required: league.gender_restriction && league.gender_restriction !== 'open',
                action: '/settings', actionLabel: 'Update Gender',
              },
              {
                id: 'gender_verified',
                label: 'Identity verified (confirms your gender)',
                done: !league.gender_restriction || league.gender_restriction === 'open' || !!profile?.identity_verified,
                required: league.gender_restriction && league.gender_restriction !== 'open',
                action: null, actionLabel: null,
              },
              { id: 'phone_verified', label: 'Verify phone number', done: league.requires_phone_verification ? !!profile?.phone_verified : true, required: !!league.requires_phone_verification, action: '/settings', actionLabel: 'Verify Phone' },
              { id: 'identity_verified', label: 'Identity verification', done: league.requires_identity_verification ? !!profile?.identity_verified : true, required: !!league.requires_identity_verification, action: '/settings', actionLabel: 'Verify Identity' },
              { id: 'chesscom_linked', label: 'Link Chess.com account', done: league.requires_chesscom_verification ? !!profile?.chesscom_verified : true, required: !!league.requires_chesscom_verification, action: '/settings', actionLabel: 'Link Chess.com' },
              { id: 'min_games', label: `Play ${league.min_games_played || 0} games`, done: (profile?.games_played || 0) >= (league.min_games_played || 0), required: (league.min_games_played || 0) > 0, action: '/play', actionLabel: 'Play Now' },
              { id: 'account_age', label: `Account ${league.min_account_age_days || 0}+ days old`, done: accountAge >= (league.min_account_age_days || 0), required: (league.min_account_age_days || 0) > 0, action: null, actionLabel: null },
              {
                id: 'rating',
                label: league.max_rating ? `Rating ${league.min_rating || 0}\u2013${league.max_rating}` : `Min rating: ${league.min_rating || 0}`,
                done: (profile?.rating || 0) >= (league.min_rating || 0) && (!league.max_rating || (profile?.rating || 0) <= league.max_rating),
                required: (league.min_rating || 0) > 0 || !!league.max_rating,
                action: '/play', actionLabel: 'Play Rated Games',
              },
              { id: 'membership', label: 'Active membership', done: league.entry_type === 'membership' ? !!hasMembership : true, required: league.entry_type === 'membership', action: '/league/subscribe', actionLabel: 'Get Membership' },
            ];

            const allRequiredMet = checklist.filter((c: any) => c.required).every((c: any) => c.done);

            if (league.registration_deadline && new Date(league.registration_deadline) < new Date()) {
              qualification = { canJoin: false, reason: 'registration_closed', isRegistered: false, checklist, regStatus: null };
            } else if (!allRequiredMet) {
              qualification = { canJoin: false, reason: 'requirements_not_met', isRegistered: false, checklist, regStatus: null };
            } else {
              qualification = { canJoin: true, reason: null, isRegistered: false, checklist, regStatus: null };
            }
          }
        }

        return {
          ...league,
          playerCount,
          registrationCount,
          standings,
          qualification,
        };
      })
    );

    // Determine recommended league tier based on player rating
    let recommendedTier: number | null = null;
    if (profile?.rating != null) {
      const r = profile.rating;
      if (r >= 2000) recommendedTier = 1;
      else if (r >= 1600) recommendedTier = 2;
      else if (r >= 1200) recommendedTier = 3;
      else if (r >= 800) recommendedTier = 4;
      else recommendedTier = 5;
    }

    return NextResponse.json({
      success: true,
      isAdmin,
      hasMembership,
      userId: user?.id || null,
      userGender: profile?.gender || null,
      userIdentityVerified: profile?.identity_verified || false,
      recommendedTier,
      market: {
        currencyCode: market.currencyCode,
        currencySymbol: market.currencySymbol,
        membershipPrice: market.membershipPrice,
        membershipActive: market.membershipActive,
      },
      leagues: leaguesWithStandings,
    });
  } catch (error: any) {
    console.error('Premium leagues API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
