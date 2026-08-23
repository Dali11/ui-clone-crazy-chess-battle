import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();

    // Try to get the current user (may not be logged in)
    const { data: { user } } = await supabase.auth.getUser();

    // Get all active/upcoming/registration leagues
    const { data: leagues, error } = await admin
      .from('premier_leagues')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get all active Swiss tournaments (type: 'swiss', status: 'upcoming' or 'active')
    const { data: tournaments } = await admin
      .from('tournaments')
      .select('*')
      .eq('type', 'swiss')
      .in('status', ['upcoming', 'active', 'pending_approval'])
      .order('starts_at', { ascending: true });

    // Build competitions list
    const competitions: any[] = [];

    // Add leagues
    for (const league of (leagues || [])) {
      const playerCount = league.player_ids?.length || 0;
      const isRegistration = league.status === 'registration';
      const isActive = league.status === 'active';

      // Get registration count if in registration
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
      let qualification: any = { canJoin: false, reason: null };
      if (user) {
        // Check if already a player or registered
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
        } else if (!isRegistration && !isActive) {
          qualification = { canJoin: false, reason: 'not_registration_phase' };
        } else if (league.status === 'completed') {
          qualification = { canJoin: false, reason: 'completed' };
        } else {
          // Check entry requirements
          let canJoin = true;
          let reason = null;

          // Check membership requirement
          if (league.entry_type === 'membership') {
            const { data: membership } = await admin
              .from('memberships')
              .select('*')
              .eq('player_id', user.id)
              .eq('status', 'active')
              .gt('end_date', new Date().toISOString())
              .single();

            if (!membership) {
              canJoin = false;
              reason = 'membership_required';
            }
          }

          // Check rating requirement
          const { data: profile } = await supabase
            .from('profiles')
            .select('rating')
            .eq('id', user.id)
            .single();

          const rating = profile?.rating || 0;
          if (league.min_rating && rating < league.min_rating) {
            canJoin = false;
            reason = 'rating_too_low';
          }
          if (league.max_rating && rating > league.max_rating) {
            canJoin = false;
            reason = 'rating_too_high';
          }

          // Check registration deadline
          if (league.registration_deadline && new Date(league.registration_deadline) < new Date()) {
            canJoin = false;
            reason = 'registration_closed';
          }

          qualification = { canJoin, reason, status: canJoin ? 'eligible' : 'ineligible' };
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
        entryType: league.entry_type || 'free',
        description: league.description,
        playerCount,
        registrationCount,
        maxPlayers: league.max_players || league.league_size,
        currentMatchday: league.current_matchday,
        totalMatchdays: league.total_matchdays,
        registrationDeadline: league.registration_deadline,
        requiresQualification: league.requires_qualification || false,
        minRating: league.min_rating || 0,
        maxRating: league.max_rating,
        qualification,
      });
    }

    // Add Swiss qualifier tournaments
    for (const tournament of (tournaments || [])) {
      const { count: participantCount } = await admin
        .from('tournament_participants')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', tournament.id);

      // Check if user is registered
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

        if (isRegistered) {
          canJoin = false;
          reason = 'already_registered';
        } else if (tournament.status === 'active') {
          canJoin = false;
          reason = 'already_started';
        } else if (tournament.status === 'pending_approval') {
          canJoin = false;
          reason = 'pending_approval';
        }

        // Check max players
        if (canJoin && tournament.max_players && participantCount && participantCount >= tournament.max_players) {
          canJoin = false;
          reason = 'full';
        }

        // Check rating requirements
        if (canJoin && (tournament.min_rating || tournament.max_rating)) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('rating')
            .eq('id', user.id)
            .single();
          const rating = profile?.rating || 0;
          if (tournament.min_rating && rating < tournament.min_rating) {
            canJoin = false;
            reason = 'rating_too_low';
          }
          if (tournament.max_rating && rating > tournament.max_rating) {
            canJoin = false;
            reason = 'rating_too_high';
          }
        }
      } else {
        canJoin = false;
        reason = 'not_authenticated';
      }

      competitions.push({
        type: 'swiss',
        id: tournament.id,
        name: tournament.name,
        status: tournament.status === 'pending_approval' ? 'pending' : tournament.status,
        entryType: tournament.entry_fee_cents > 0 ? 'paid' : 'free',
        entryFee: tournament.entry_fee_cents,
        description: tournament.description,
        playerCount: participantCount || 0,
        maxPlayers: tournament.max_players,
        rounds: tournament.rounds,
        startsAt: tournament.starts_at,
        endsAt: tournament.ends_at,
        timeControl: tournament.time_control,
        minRating: tournament.min_rating || 0,
        maxRating: tournament.max_rating,
        isRegistered,
        qualification: { canJoin, reason },
      });
    }

    // Get user's membership status if logged in
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
    }

    return NextResponse.json({
      success: true,
      competitions,
      user: user ? { id: user.id } : null,
      membership,
    });
  } catch (error: any) {
    console.error('Competitions API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
