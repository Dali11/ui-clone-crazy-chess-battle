import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMarketConfig } from '@/lib/league/market-config';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();

    let isAdmin = false;
    let profile: any = null;

    if (user) {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, username, display_name, full_name, country, gender, rating, is_admin, phone_verified, identity_verified, chesscom_verified, games_played, account_created_at, created_at')
        .eq('id', user.id)
        .single();
      profile = profileData;
      isAdmin = !!profile?.is_admin;
    }

    const market = await getMarketConfig(profile?.country);

    // Get membership status
    let membership: any = null;
    if (user) {
      const { data: membershipData } = await admin
        .from('memberships')
        .select('*')
        .eq('player_id', user.id)
        .eq('status', 'active')
        .gt('end_date', new Date().toISOString())
        .limit(1)
        .single();
      membership = membershipData;
    }

    // ============================================================
    // PREMIUM LEAGUES (tiered, gender-separated)
    // ============================================================

    const { data: leagues, error: leagueError } = await admin
      .from('premier_leagues')
      .select('*')
      .order('tier', { ascending: true })
      .order('created_at', { ascending: false });

    const tiered: Record<number, { men: any[]; women: any[]; open: any[] }> = {};

    for (const league of (leagues || [])) {
      const playerCount = league.player_ids?.length || 0;

      let registrationCount = 0;
      if (league.status === 'registration') {
        const { count } = await admin
          .from('league_registrations')
          .select('id', { count: 'exact', head: true })
          .eq('league_id', league.id)
          .in('status', ['pending', 'approved']);
        registrationCount = count || 0;
      }

      // Build qualification checklist for logged-in users
      let qualification: any = { canJoin: false, reason: 'not_authenticated', status: 'guest' };

      if (user) {
        const isPlayer = league.player_ids?.includes(user.id);
        const { data: existingReg } = await admin
          .from('league_registrations')
          .select('*')
          .eq('league_id', league.id)
          .eq('player_id', user.id)
          .single();

        if (isPlayer) {
          qualification = { canJoin: false, reason: 'already_joined', status: 'participating' };
        } else if (existingReg) {
          qualification = { canJoin: false, reason: 'already_registered', status: existingReg.status };
        } else if (league.status === 'completed') {
          qualification = { canJoin: false, reason: 'completed' };
        } else if (league.status !== 'registration') {
          qualification = { canJoin: false, reason: 'not_registration_phase' };
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
              done: !league.gender_restriction || league.gender_restriction === 'open' || profile?.gender === league.gender_restriction,
              required: league.gender_restriction && league.gender_restriction !== 'open',
              action: '/settings', actionLabel: 'Update Gender',
            },
            { id: 'phone_verified', label: 'Verify phone number', done: league.requires_phone_verification ? !!profile?.phone_verified : true, required: !!league.requires_phone_verification, action: '/settings', actionLabel: 'Verify Phone' },
            { id: 'identity_verified', label: 'Identity verification', done: league.requires_identity_verification ? !!profile?.identity_verified : true, required: !!league.requires_identity_verification, action: '/settings', actionLabel: 'Verify Identity' },
            { id: 'chesscom_linked', label: 'Link Chess.com account', done: league.requires_chesscom_verification ? !!profile?.chesscom_verified : true, required: !!league.requires_chesscom_verification, action: '/settings', actionLabel: 'Link Chess.com' },
            { id: 'min_games', label: `Play ${league.min_games_played || 0} games`, done: (profile?.games_played || 0) >= (league.min_games_played || 0), required: (league.min_games_played || 0) > 0, action: '/play', actionLabel: 'Play Now' },
            { id: 'account_age', label: `Account ${league.min_account_age_days || 0}+ days old`, done: accountAge >= (league.min_account_age_days || 0), required: (league.min_account_age_days || 0) > 0, action: null, actionLabel: null },
            {
              id: 'rating',
              label: league.max_rating ? `Rating ${league.min_rating || 0}–${league.max_rating}` : `Min rating: ${league.min_rating || 0}`,
              done: (profile?.rating || 0) >= (league.min_rating || 0) && (!league.max_rating || (profile?.rating || 0) <= league.max_rating),
              required: (league.min_rating || 0) > 0 || !!league.max_rating,
              action: '/play', actionLabel: 'Play Rated Games',
            },
            { id: 'membership', label: 'Active membership', done: league.entry_type === 'membership' ? !!membership : true, required: league.entry_type === 'membership', action: '/league/subscribe', actionLabel: 'Get Membership' },
          ];

          const allRequiredMet = checklist.filter(c => c.required).every(c => c.done);

          if (league.registration_deadline && new Date(league.registration_deadline) < new Date()) {
            qualification = { canJoin: false, reason: 'registration_closed', checklist };
          } else if (!allRequiredMet) {
            qualification = { canJoin: false, reason: 'requirements_not_met', checklist };
          } else {
            qualification = { canJoin: true, reason: null, checklist, status: 'eligible' };
          }
        }
      }

      const comp = {
        type: 'league' as const,
        id: league.id,
        name: league.name,
        country: league.country,
        status: league.status,
        tier: league.tier || 1,
        genderRestriction: league.gender_restriction || 'open',
        entryType: league.entry_type || 'free',
        description: league.description,
        playerCount,
        registrationCount,
        maxPlayers: league.league_size,
        currentMatchday: league.current_matchday,
        totalMatchdays: league.total_matchdays,
        registrationDeadline: league.registration_deadline,
        promotesCount: league.promotes_count || 2,
        relegatesCount: league.relegates_count || 2,
        requiresPhoneVerification: league.requires_phone_verification || false,
        requiresIdentityVerification: league.requires_identity_verification || false,
        requiresChesscomVerification: league.requires_chesscom_verification || false,
        minGamesPlayed: league.min_games_played || 0,
        minAccountAgeDays: league.min_account_age_days || 0,
        minRating: league.min_rating || 0,
        maxRating: league.max_rating,
        qualification,
      };

      const tier = comp.tier;
      const gender = comp.genderRestriction;
      if (!tiered[tier]) tiered[tier] = { men: [], women: [], open: [] };
      if (gender === 'male') tiered[tier].men.push(comp);
      else if (gender === 'female') tiered[tier].women.push(comp);
      else tiered[tier].open.push(comp);
    }

    // ============================================================
    // TOURNAMENTS (Swiss — open to all players; each tournament sets its own optional player cap and free/paid entry fee)
    // ============================================================

    const { data: tournaments, error: tournamentError } = await admin
      .from('tournaments')
      .select('*')
      .in('status', ['upcoming', 'active', 'pending_approval', 'completed', 'finished'])
      .order('created_at', { ascending: false })
      .limit(50);

    const tournamentList: any[] = [];

    for (const tournament of (tournaments || [])) {
      const { count: participantCount } = await admin
        .from('tournament_participants')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id);

      let isRegistered = false;
      let canJoin = true;
      let reason = null;

      if (user) {
        const { data: existing } = await admin
          .from('tournament_participants')
          .select('id')
          .eq('tournament_id', tournament.id)
          .eq('player_id', user.id)
          .single();
        isRegistered = !!existing;
      }

      if (isRegistered) { canJoin = false; reason = 'already_registered'; }
      else if (tournament.status === 'active') { canJoin = false; reason = 'already_started'; }
      else if (tournament.status === 'pending_approval') { canJoin = false; reason = 'pending_approval'; }
      else if (tournament.status === 'completed' || tournament.status === 'finished') { canJoin = false; reason = 'completed'; }
      else if (tournament.status !== 'upcoming') { canJoin = false; reason = 'not_joinable'; }
      else if (!user) { canJoin = false; reason = 'not_authenticated'; }

      tournamentList.push({
        type: 'tournament' as const,
        id: tournament.id,
        name: tournament.name,
        status: tournament.status === 'pending_approval' ? 'pending' : tournament.status === 'finished' ? 'completed' : tournament.status,
        entryType: tournament.entry_fee > 0 ? 'paid' : 'free',
        entryFee: tournament.entry_fee,
        currency: market.currencyCode,
        currencySymbol: market.currencySymbol,
        playerCount: participantCount || 0,
        maxPlayers: tournament.max_players || null, // null = no cap
        rounds: tournament.rounds,
        startsAt: tournament.starts_at,
        timeControl: tournament.time_control,
        thumbnailUrl: tournament.thumbnail_url,
        isRegistered,
        qualification: { canJoin, reason },
      });
    }

    return NextResponse.json({
      success: true,
      isAdmin,
      user: user ? { id: user.id } : null,
      tiered,
      tournaments: tournamentList,
    });
  } catch (error: any) {
    console.error('Competitions API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
