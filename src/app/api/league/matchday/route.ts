import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const matchdayParam = request.nextUrl.searchParams.get('matchday');
    const leagueId = request.nextUrl.searchParams.get('leagueId');

    let league;
    if (leagueId) {
      const { data } = await supabase.from('premier_leagues').select('*').eq('id', leagueId).single();
      league = data;
    } else {
      const { data } = await supabase.from('premier_leagues').select('*').or('status.eq.active,status.eq.upcoming').order('created_at', { ascending: false }).limit(1).single();
      league = data;
    }
    if (!league) return NextResponse.json({ error: 'No league found' }, { status: 404 });

    const md = matchdayParam ? parseInt(matchdayParam) : (league.current_matchday || 1);
    const { data: fixtures } = await supabase.from('league_fixtures').select('*').eq('league_id', league.id).eq('matchday', md);
    
    // Enrich with player data
    const playerIds = new Set<string>();
    (fixtures || []).forEach((f: any) => { if (f.home_player_id) playerIds.add(f.home_player_id); if (f.away_player_id) playerIds.add(f.away_player_id); });
    const playersMap = new Map<string, any>();
    if (playerIds.size > 0) {
      const { data: players } = await supabase.from('profiles').select('id, username, display_name, avatar_url, country, rating').in('id', Array.from(playerIds));
      (players || []).forEach((p: any) => playersMap.set(p.id, p));
    }
    const enriched = (fixtures || []).map((f: any) => ({
      ...f,
      home_player: f.home_player_id ? playersMap.get(f.home_player_id) : null,
      away_player: f.away_player_id ? playersMap.get(f.away_player_id) : null,
    }));

    const allPlayed = enriched.length > 0 && enriched.every((f: any) => f.played);
    const somePlayed = enriched.some((f: any) => f.played);
    const status = allPlayed ? 'completed' : somePlayed ? 'live' : 'upcoming';

    return NextResponse.json({
      success: true,
      league: { id: league.id, name: league.name, currentMatchday: league.current_matchday, totalMatchdays: league.total_matchdays },
      matchday: { number: md, status, totalFixtures: enriched.length },
      fixtures: enriched,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
