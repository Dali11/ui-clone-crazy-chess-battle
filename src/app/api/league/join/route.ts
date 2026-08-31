import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getPlatformConfig } from '@/lib/platform-config';
import { moneySymbol } from "@/lib/geo/format";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {

  // Fetch user's country for currency display
  const { data: _profile } = await supabase
    .from("profiles")
    .select("country")
    .eq("id", user.id)
    .single();
  const sym = moneySymbol(_profile?.country);
      return NextResponse.json({ error: 'You must be logged in to join a competition' }, { status: 401 });
    }

    const { leagueId, competitionType, tournamentId } = await request.json();

    // Join a Premier League
    if (leagueId) {
      const admin = createAdminClient();

      // ─── Load platform config for leagues ──────────────────────────
      const lConfig = await getPlatformConfig(admin, 'leagues');
      const { data: league, error } = await admin
        .from('premier_leagues')
        .select('*')
        .eq('id', leagueId)
        .single();

      if (error || !league) {
        return NextResponse.json({ error: 'League not found' }, { status: 404 });
      }

      // Allow registration during 'registration' phase OR mid-season join during 'active'
      if (league.status !== 'registration' && league.status !== 'active') {
        return NextResponse.json({ error: 'This league is not accepting new players' }, { status: 400 });
      }
      const isMidSeasonJoin = league.status === 'active';

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

      // ── EXCLUSIVITY: a player can only be in ONE league at a time ──
      // Check if the player is already registered in any other league that
      // is still running (registration or active — not finished/cancelled).
      const { data: otherRegs } = await admin
        .from('league_registrations')
        .select('league_id')
        .eq('player_id', user.id)
        .neq('league_id', leagueId);

      if (otherRegs && otherRegs.length > 0) {
        const otherLeagueIds = otherRegs.map((r) => r.league_id);
        const { data: otherLeagues } = await admin
          .from('premier_leagues')
          .select('id, name, status')
          .in('id', otherLeagueIds)
          .in('status', ['registration', 'active']);

        if (otherLeagues && otherLeagues.length > 0) {
          return NextResponse.json({
            error: `You're already in ${otherLeagues[0].name}. You can only be in one league at a time — leave it first if you want to switch.`,
            code: 'already_in_league',
          }, { status: 400 });
        }
      }

      // Check registration deadline
      if (league.registration_deadline && new Date(league.registration_deadline) < new Date()) {
        return NextResponse.json({ error: 'Registration deadline has passed' }, { status: 400 });
      }

      // Check membership requirement (configurable via platform settings)
      const requireMembership = lConfig.require_membership !== false;
      if (requireMembership && league.entry_type === 'membership') {
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

      // Season 1: rating bands are recommendations only — players can join any tier.
      // The /league page shows a "Recommended" badge based on rating, but doesn't block.

      // Check gender restriction + identity verification
      if (league.gender_restriction && league.gender_restriction !== 'open') {
        const { data: profileData } = await admin
          .from('profiles')
          .select('gender, identity_verified')
          .eq('id', user.id)
          .single();

        if (!profileData?.identity_verified) {
          return NextResponse.json({
            error: 'Identity verification required to join gender-restricted leagues. An admin must verify your identity before you can register.',
            code: 'identity_verification_required',
          }, { status: 403 });
        }

        if (profileData.gender !== league.gender_restriction) {
          return NextResponse.json({
            error: `This league is for ${league.gender_restriction === 'female' ? 'women' : 'men'} only. Your verified gender does not match this division.`,
            code: 'gender_mismatch',
          }, { status: 403 });
        }
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
          qualification_reason: isMidSeasonJoin ? 'mid_season_join' : 'met_all_requirements',
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

      // ── MID-SEASON JOIN: generate fixtures for remaining matchdays ──
      if (isMidSeasonJoin) {
        const currentMatchday = league.current_matchday || 1;
        const totalMatchdays = league.total_matchdays || 0;

        // Get existing fixtures to find which matchdays still have pending games
        const { data: existingFixtures } = await admin
          .from('league_fixtures')
          .select('matchday, home_player_id, away_player_id, played')
          .eq('league_id', leagueId)
          .order('matchday', { ascending: true });

        // Build a set of existing fixture keys (player pair per matchday)
        const existingPairs = new Set<string>();
        for (const f of existingFixtures || []) {
          existingPairs.add(`${f.matchday}:${f.home_player_id}:${f.away_player_id}`);
          existingPairs.add(`${f.matchday}:${f.away_player_id}:${f.home_player_id}`);
        }

        // Get all current player IDs (including the new joiner)
        const allPlayers = updatedPlayerIds;

        // Generate new fixtures: new player vs each existing player, for matchdays >= current
        // Only for matchdays that haven't been fully played yet
        const newFixtures: any[] = [];
        for (let md = currentMatchday; md <= totalMatchdays; md++) {
          // Check if this matchday has any unplayed fixtures (still active)
          const mdFixtures = (existingFixtures || []).filter(f => f.matchday === md);
          const hasUnplayed = mdFixtures.some(f => !f.played);
          if (!hasUnplayed && mdFixtures.length > 0) continue; // matchday already done

          for (const opponentId of allPlayers) {
            if (opponentId === user.id) continue;
            const key = `${md}:${user.id}:${opponentId}`;
            if (existingPairs.has(key)) continue;

            // Alternate home/away by matchday for fairness
            const isHome = (md + allPlayers.indexOf(opponentId)) % 2 === 0;
            newFixtures.push({
              league_id: leagueId,
              matchday: md,
              home_player_id: isHome ? user.id : opponentId,
              away_player_id: isHome ? opponentId : user.id,
              result: 'pending',
              played: false,
            });
          }
        }

        if (newFixtures.length > 0) {
          const { error: fixtureErr } = await admin
            .from('league_fixtures')
            .insert(newFixtures);
          if (fixtureErr) console.error('Mid-season fixture generation failed:', fixtureErr);
        }

        // Create standings entry for the new player (0 points, 0 games)
        const { error: standingsErr } = await admin
          .from('league_standings')
          .insert({
            league_id: leagueId,
            player_id: user.id,
            position: 0,
            previous_position: 0,
            played: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            points: 0,
            form: [],
          });
        if (standingsErr) console.error('Standings entry creation failed:', standingsErr);

        // Recalculate standings to position the new player at the bottom
        const { recalcStandings } = await import('@/lib/league/engine');
        await recalcStandings(admin as any, leagueId);

        return NextResponse.json({
          success: true,
          message: 'Joined mid-season! Your remaining fixtures have been scheduled.',
          midSeason: true,
          fixturesAdded: newFixtures.length,
        });
      }

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
      const entryFee = tournament.entry_fee || 0;
      let paidEntryFee = false;

      if (entryFee > 0) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('wallet_balance')
          .eq('id', user.id)
          .single();
        const currentBalance = profile?.wallet_balance ?? 0;
        if (currentBalance < entryFee) {
          const feeMwk = entryFee;
          return NextResponse.json({
            error: `Insufficient wallet balance. Entry fee is ${sym} ${feeMwk.toLocaleString()}. You have ${sym} ${currentBalance.toLocaleString()}. Please deposit funds first.`,
          }, { status: 402 });
        }

        const { error: debitErr } = await admin.rpc('debit_wallet', {
          p_user_id: user.id,
          p_amount: entryFee,
        });
        if (debitErr) {
          if (debitErr.message?.includes('Insufficient balance')) {
            return NextResponse.json({ error: 'Insufficient wallet balance. Please deposit funds first.' }, { status: 402 });
          }
          return NextResponse.json({ error: 'Failed to process entry fee.' }, { status: 500 });
        }
        paidEntryFee = true;

        // Add entry fee to prize pool ONLY if pool_source is not 'fixed'.
        // Atomic RPC (single UPDATE) — avoids losing increments when several
        // players join around the same time.
        if (tournament.pool_source !== 'fixed') {
          await admin.rpc('increment_tournament_prize_pool', {
            p_tournament_id: tournamentId,
            p_amount: entryFee,
          });
        }

        // Audit log
        await admin.from('deposits').insert({
          user_id: user.id,
          amount: -entryFee,
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
          await admin.rpc('credit_wallet', { p_user_id: user.id, p_amount: entryFee });
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
