import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    const { data: { user } } = await supabase.auth.getUser();

    // Get all leagues with tier info
    const { data: leagues, error } = await admin
      .from('premier_leagues')
      .select('*')
      .order('tier', { ascending: true })
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get all active Swiss tournaments
    const { data: tournaments } = await admin
      .from('tournaments')
      .select('*')
      .in('status', ['upcoming', 'active', 'pending_approval'])
      .order('starts_at', { ascending: true });

    // Build competitions list grouped by tier and gender
    const competitions: any[] = [];

    for (const league of (leagues || [])) {
      const playerCount = league.player_ids?.length || 0;
      const isRegistration = league.status === 'registration';

      // Get registration count
      let registrationCount = 0;
      if (isRegistration) {
        const { count } = await admin
          .from('league_registrations')
          .select('id', { count: 'exact', head: true })
          .eq('league_id', league.id)
          .in('status', ['pending', 'approved']);
        registrationCount = count || 0;
      }

      // Check qualification for logged-in user
      let qualification: any = { canJoin: false, reason: null, checklist: null };

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
          // Get player profile for checks
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, gender, rating, full_name, display_name, country, phone_verified, identity_verified, chesscom_verified, games_played, account_created_at, created_at')
            .eq('id', user.id)
            .single();

          // Get membership
          const { data: membership } = await admin
            .from('memberships')
            .select('id')
            .eq('player_id', user.id)
            .eq('status', 'active')
            .gt('end_date', new Date().toISOString())
            .limit(1)
            .single();

          // Build checklist
          const accountAge = profile ? Math.floor(
            (Date.now() - new Date(profile.account_created_at || profile.created_at || Date.now()).getTime()) / (1000 * 60 * 60 * 24)
          ) : 0;

          const checklist = [
            { id: 'profile_complete', label: 'Complete your profile', done: !!(profile?.full_name && profile?.display_name && profile?.country), required: true },
            { id: 'gender_selected', label: 'Select your gender', done: !!profile?.gender, required: true },
            {
              id: 'gender_requirement',
              label: `Gender: ${league.gender_restriction || 'open'} division`,
              done: !league.gender_restriction || league.gender_restriction === 'open' || profile?.gender === league.gender_restriction,
              required: league.gender_restriction !== 'open' && league.gender_restriction !== null,
            },
            { id: 'phone_verified', label: 'Verify phone number', done: league.requires_phone_verification ? !!profile?.phone_verified : true, required: !!league.requires_phone_verification },
            { id: 'identity_verified', label: 'Identity verification', done: league.requires_identity_verification ? !!profile?.identity_verified : true, required: !!league.requires_identity_verification },
            { id: 'chesscom_linked', label: 'Link Chess.com account', done: league.requires_chesscom_verification ? !!profile?.chesscom_verified : true, required: !!league.requires_chesscom_verification },
            { id: 'min_games', label: `Play ${league.min_games_played || 0} games`, done: (profile?.games_played || 0) >= (league.min_games_played || 0), required: (league.min_games_played || 0) > 0 },
            { id: 'account_age', label: `Account ${league.min_account_age_days || 0}+ days old`, done: accountAge >= (league.min_account_age_days || 0), required: (league.min_account_age_days || 0) > 0 },
            {
              id: 'rating',
              label: league.maxRating ? `Rating ${league.min_rating || 0}–${league.maxRating}` : `Min rating: ${league.min_rating || 0}`,
              done: (profile?.rating || 0) >= (league.min_rating || 0) && (!league.max_rating || (profile?.rating || 0) <= league.max_rating),
              required: (league.min_rating || 0) > 0 || !!league.max_rating,
            },
            { id: 'membership', label: 'Active membership', done: league.entry_type === 'membership' ? !!membership : true, required: league.entry_type === 'membership' },
          ];

          const allRequiredMet = checklist.filter(c => c.required).every(c => c.done);

          // Check registration deadline
          if (league.registration_deadline && new Date(league.registration_deadline) < new Date()) {
            qualification = { canJoin: false, reason: 'registration_closed', checklist };
          } else if (!allRequiredMet) {
            qualification = { canJoin: false, reason: 'requirements_not_met', checklist };
          } else {
            qualification = { canJoin: true, reason: null, checklist, status: 'eligible' };
          }
        }
      } else {
        qualification = { canJoin: false, reason: 'not_authenticated', status: 'guest' };
      }

      competitions.push({
        type: 'league',
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
      });
    }

    // Add Swiss tournaments
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

        if (isRegistered) { canJoin = false; reason = 'already_registered'; }
        else if (tournament.status === 'active') { canJoin = false; reason = 'already_started'; }
        else if (tournament.status === 'pending_approval') { canJoin = false; reason = 'pending_approval'; }
        else if (tournament.max_players && participantCount && participantCount >= tournament.max_players) { canJoin = false; reason = 'full'; }
      } else { canJoin = false; reason = 'not_authenticated'; }

      competitions.push({
        type: 'swiss',
        id: tournament.id,
        name: tournament.name,
        status: tournament.status === 'pending_approval' ? 'pending' : tournament.status,
        tier: 0, // Swiss qualifiers are not tiered
        genderRestriction: 'open',
        entryType: tournament.entry_fee_cents > 0 ? 'paid' : 'free',
        playerCount: participantCount || 0,
        maxPlayers: tournament.max_players,
        rounds: tournament.rounds,
        startsAt: tournament.starts_at,
        timeControl: tournament.time_control,
        isRegistered,
        qualification: { canJoin, reason },
      });
    }

    // Group by tier
    const tiered: any = {};
    for (const comp of competitions) {
      if (comp.type === 'league') {
        const tier = comp.tier || 1;
        const gender = comp.genderRestriction || 'open';
        if (!tiered[tier]) tiered[tier] = { men: [], women: [], open: [] };
        if (gender === 'male') tiered[tier].men.push(comp);
        else if (gender === 'female') tiered[tier].women.push(comp);
        else tiered[tier].open.push(comp);
      }
    }

    const swissQualifiers = competitions.filter(c => c.type === 'swiss');

    return NextResponse.json({
      success: true,
      tiered,
      swissQualifiers,
      user: user ? { id: user.id } : null,
    });
  } catch (error: any) {
    console.error('Competitions API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
