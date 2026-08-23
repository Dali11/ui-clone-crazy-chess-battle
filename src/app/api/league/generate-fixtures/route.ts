import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateRoundRobin, recalcStandings } from '@/lib/league/engine';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leagueId, playerIds, name, country, seasonId, scoringConfig } = body;

    const supabase = createAdminClient();

    // Create league if name provided, otherwise use existing
    let league;
    if (name) {
      const { data, error } = await supabase.from('premier_leagues').insert({
        name, country: country || 'MW',
        season_id: seasonId || null,
        scoring_config: scoringConfig || { winPoints: 3, drawPoints: 1, lossPoints: 0 },
        player_ids: playerIds,
        status: 'upcoming',
        qualifying_spots: 4,
      }).select('*').single();
      if (error) throw error;
      league = data;
    } else {
      const { data, error } = await supabase.from('premier_leagues').select('*').eq('id', leagueId).single();
      if (error) throw error;
      league = data;
    }

    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });
    const ids = playerIds || league.player_ids;
    if (!ids || ids.length < 2) return NextResponse.json({ error: 'Need at least 2 players' }, { status: 400 });

    // Generate fixtures
    const fixturesData = generateRoundRobin(ids);
    const totalMatchdays = ids.length % 2 === 0 ? ids.length - 1 : ids.length;

    // Insert fixtures
    const fixturesToInsert = fixturesData.map(f => ({
      league_id: league.id,
      matchday: f.matchday,
      home_player_id: f.home_player_id,
      away_player_id: f.away_player_id,
      result: 'pending',
      played: false,
    }));
    const { error: fixtureError } = await supabase.from('league_fixtures').insert(fixturesToInsert);
    if (fixtureError) throw fixtureError;

    // Create initial standings
    const standingsToInsert = ids.map((pid: string) => ({
      league_id: league.id,
      player_id: pid,
      position: 0,
      previous_position: 0,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      form: [],
    }));
    await supabase.from('league_standings').insert(standingsToInsert);

    // Update league
    await supabase.from('premier_leagues').update({
      total_matchdays: totalMatchdays,
      current_matchday: 1,
      player_ids: ids,
      status: 'active',
      updated_at: new Date().toISOString(),
    }).eq('id', league.id);

    return NextResponse.json({ success: true, leagueId: league.id, totalMatchdays, totalFixtures: fixturesData.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
