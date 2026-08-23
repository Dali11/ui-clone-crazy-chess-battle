import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStreak } from '@/lib/league/engine';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const leagueId = request.nextUrl.searchParams.get('leagueId');

    // Get the first active league if no leagueId provided
    let league;
    if (leagueId) {
      const { data } = await supabase.from('premier_leagues').select('*').eq('id', leagueId).single();
      league = data;
    } else {
      const { data } = await supabase.from('premier_leagues').select('*').or('status.eq.active,status.eq.upcoming').order('created_at', { ascending: false }).limit(1).single();
      league = data;
    }
    if (!league) return NextResponse.json({ error: 'No league found' }, { status: 404 });

    // Get season
    let season = null;
    if (league.season_id) {
      const { data } = await supabase.from('competitive_seasons').select('*').eq('id', league.season_id).single();
      season = data;
    }

    // Get standings with player data
    const { data: rawStandings } = await supabase.from('league_standings').select('*').eq('league_id', league.id);
    const playerIds = (rawStandings || []).map((s: any) => s.player_id);
    const playersMap = new Map<string, any>();
    if (playerIds.length > 0) {
      const { data: players } = await supabase.from('profiles').select('id, username, display_name, avatar_url, country, rating').in('id', playerIds);
      (players || []).forEach((p: any) => playersMap.set(p.id, p));
    }
    const standings = (rawStandings || []).sort((a: any, b: any) => (a.position || 999) - (b.position || 999)).map((s: any) => ({
      ...s, player: playersMap.get(s.player_id) || null,
    }));

    // Get all fixtures
    const { data: allFixtures } = await supabase.from('league_fixtures').select('*').eq('league_id', league.id);
    const fixtures = (allFixtures || []) as any[];
    const fixturePlayerIds = new Set<string>();
    fixtures.forEach((f: any) => { if (f.home_player_id) fixturePlayerIds.add(f.home_player_id); if (f.away_player_id) fixturePlayerIds.add(f.away_player_id); });
    const fixturePlayers = new Map<string, any>();
    if (fixturePlayerIds.size > 0) {
      const { data: players } = await supabase.from('profiles').select('id, username, display_name, avatar_url, country, rating').in('id', Array.from(fixturePlayerIds));
      (players || []).forEach((p: any) => fixturePlayers.set(p.id, p));
    }
    const enrichFixture = (f: any) => ({
      ...f,
      home_player: f.home_player_id ? fixturePlayers.get(f.home_player_id) : null,
      away_player: f.away_player_id ? fixturePlayers.get(f.away_player_id) : null,
    });

    const currentMatchday = league.current_matchday || 1;
    const upcomingFixtures = fixtures.filter(f => f.matchday === currentMatchday && !f.played).map(enrichFixture);
    const completedFixtures = fixtures.filter(f => f.played).sort((a, b) => b.matchday - a.matchday);
    const lastCompletedMatchday = completedFixtures[0]?.matchday || 0;
    const latestResults = completedFixtures.filter(f => f.matchday === lastCompletedMatchday).map(enrichFixture);
    const topPlayers = standings.slice(0, 5);
    const movements = standings.map((s: any) => ({
      player_id: s.player_id, player: s.player, position: s.position,
      previous_position: s.previous_position || s.position,
      movement: (s.previous_position || s.position) > s.position ? 'up' : (s.previous_position || s.position) < s.position ? 'down' : 'same',
      move_amount: Math.abs((s.previous_position || s.position) - s.position),
    })).filter((m: any) => m.movement !== 'same');

    return NextResponse.json({
      success: true,
      league: { ...league, currentMatchday, totalMatchdays: league.total_matchdays, qualifying_spots: league.qualifying_spots },
      season,
      standings,
      upcomingMatchday: { matchday: currentMatchday, totalMatchdays: league.total_matchdays, fixtures: upcomingFixtures },
      latestResults: { matchday: lastCompletedMatchday, fixtures: latestResults },
      topPlayers,
      movements,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
