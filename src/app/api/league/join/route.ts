import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'You must be logged in to join a competition' }, { status: 401 });
    }

    const { leagueId, competitionType, tournamentId } = await request.json();

    // Join a Premier League
    if (leagueId) {
      const admin = createAdminClient();
      const { data: league, error } = await admin
        .from('premier_leagues')
        .select('*')
        .eq('id', leagueId)
        .single();

      if (error || !league) {
        return NextResponse.json({ error: 'League not found' }, { status: 404 });
      }

      if (league.status !== 'registration') {
        return NextResponse.json({ error: 'Registration is not open for this league' }, { status: 400 });
      }

      // Check if already a player
      if (league.player_ids?.includes(user.id)) {
        return NextResponse.json({ error: 'You are already in this league' }, { status: 400 });
      }

      // Check existing registration
      const { data: existing } = await admin
        .from('league_registrations')
        .select('*')
        .eq('league_id', leagueId)
        .eq('player_id', user.id)
        .single();

      if (existing) {
        return NextResponse.json({ error: 'You have already registered for this league' }, { status: 400 });
      }

      // Check registration deadline
      if (league.registration_deadline && new Date(league.registration_deadline) < new Date()) {
        return NextResponse.json({ error: 'Registration deadline has passed' }, { status: 400 });
      }

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
          return NextResponse.json({
            error: 'Active CrazyChess Club membership required to join this competition',
            code: 'membership_required',
          }, { status: 403 });
        }
      }

      // Check rating requirements
      const { data: profile } = await supabase
        .from('profiles')
        .select('rating')
        .eq('id', user.id)
        .single();
      const rating = profile?.rating || 0;

      if (league.min_rating && rating < league.min_rating) {
        return NextResponse.json({ error: `Minimum rating of ${league.min_rating} required` }, { status: 403 });
      }
      if (league.max_rating && rating > league.max_rating) {
        return NextResponse.json({ error: `Maximum rating of ${league.max_rating} required` }, { status: 403 });
      }

      // Check max players
      if (league.league_size) {
        const { count } = await admin
          .from('league_registrations')
          .select('id', { count: 'exact', head: true })
          .eq('league_id', leagueId)
          .in('status', ['pending', 'approved']);
        if (count && count >= league.league_size) {
          return NextResponse.json({ error: 'League is full' }, { status: 400 });
        }
      }

      // Create registration
      const { error: regError } = await admin
        .from('league_registrations')
        .insert({
          league_id: leagueId,
          player_id: user.id,
          status: 'approved', // Auto-approve for now if all checks pass
          qualified: true,
          qualification_reason: 'met_all_requirements',
          registered_at: new Date().toISOString(),
        });

      if (regError) throw regError;

      // Add to player_ids
      const currentPlayerIds = league.player_ids || [];
      const updatedPlayerIds = [...currentPlayerIds, user.id];
      await admin
        .from('premier_leagues')
        .update({ player_ids: updatedPlayerIds, updated_at: new Date().toISOString() })
        .eq('id', leagueId);

      return NextResponse.json({ success: true, message: 'Successfully joined the league!' });
    }

    // Join a Swiss tournament
    if (tournamentId && competitionType === 'swiss') {
      const admin = createAdminClient();
      const { data: tournament, error } = await admin
        .from('tournaments')
        .select('*')
        .eq('id', tournamentId)
        .single();

      if (error || !tournament) {
        return NextResponse.json({ error: 'Tournament not found' }, { status: 404 });
      }

      if (tournament.status !== 'upcoming') {
        return NextResponse.json({ error: 'Registration is not open' }, { status: 400 });
      }

      // Check if already registered
      const { data: existing } = await admin
        .from('tournament_participants')
        .select('id')
        .eq('tournament_id', tournamentId)
        .eq('player_id', user.id)
        .single();

      if (existing) {
        return NextResponse.json({ error: 'Already registered' }, { status: 400 });
      }

      // Check max players
      if (tournament.max_players) {
        const { count } = await admin
          .from('tournament_participants')
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', tournamentId);
        if (count && count >= tournament.max_players) {
          return NextResponse.json({ error: 'Tournament is full' }, { status: 400 });
        }
      }

      // Check rating requirements
      if (tournament.min_rating || tournament.max_rating) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('rating')
          .eq('id', user.id)
          .single();
        const rating = profile?.rating || 0;
        if (tournament.min_rating && rating < tournament.min_rating) {
          return NextResponse.json({ error: `Minimum rating of ${tournament.min_rating} required` }, { status: 403 });
        }
        if (tournament.max_rating && rating > tournament.max_rating) {
          return NextResponse.json({ error: `Maximum rating of ${tournament.max_rating} required` }, { status: 403 });
        }
      }

      // Enforce entry fee — debit wallet if fee > 0
      const entryFee = tournament.entry_fee_cents || 0;
      let paidEntryFee = false;

      if (entryFee > 0) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('wallet_balance_cents')
          .eq('id', user.id)
          .single();
        const currentBalance = profile?.wallet_balance_cents ?? 0;
        if (currentBalance < entryFee) {
          const feeMwk = Math.floor(entryFee / 100);
          return NextResponse.json({
            error: `Insufficient wallet balance. Entry fee is MK ${feeMwk.toLocaleString()}. You have MK ${Math.floor(currentBalance / 100).toLocaleString()}. Please deposit funds first.`,
          }, { status: 402 });
        }

        const { error: debitErr } = await admin.rpc('debit_wallet', {
          p_user_id: user.id,
          p_amount_cents: entryFee,
        });
        if (debitErr) {
          if (debitErr.message?.includes('Insufficient balance')) {
            return NextResponse.json({ error: 'Insufficient wallet balance. Please deposit funds first.' }, { status: 402 });
          }
          return NextResponse.json({ error: 'Failed to process entry fee.' }, { status: 500 });
        }
        paidEntryFee = true;

        // Add entry fee to prize pool
        await admin.from('tournaments')
          .update({ prize_pool_cents: (tournament.prize_pool_cents || 0) + entryFee })
          .eq('id', tournamentId);

        // Audit log
        await admin.from('deposits').insert({
          user_id: user.id,
          amount_cents: -entryFee,
          status: 'success',
          method: 'tournament_entry',
          reference: `tournament:${tournamentId}:entry`,
        });
      }

      // Register
      const { error: partError } = await admin
        .from('tournament_participants')
        .insert({
          tournament_id: tournamentId,
          player_id: user.id,
          score: 0,
          wins: 0,
          games_played: 0,
          paid_entry_fee: paidEntryFee,
        });

      if (partError) {
        // Refund if debited
        if (paidEntryFee) {
          await admin.rpc('credit_wallet', { p_user_id: user.id, p_amount_cents: entryFee });
        }
        throw partError;
      }

      return NextResponse.json({ success: true, message: 'Successfully registered for the tournament!' });
    }

    return NextResponse.json({ error: 'Missing leagueId or tournamentId' }, { status: 400 });
  } catch (error: any) {
    console.error('Join competition error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
