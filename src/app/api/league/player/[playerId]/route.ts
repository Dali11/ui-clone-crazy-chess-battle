import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getStreak } from '@/lib/league/engine';

export async function GET(request: NextRequest, { params }: { params: Promise<{ playerId: string }> }) {
  try {
    const { playerId } = await params;
    const leagueId = request.nextUrl.searchParams.get('leagueId');
    const supabase = createAdminClient();

    let league;
    if (leagueId) {
      const { data } = await supabase.from('premier_leagues').select('*').eq('id', leagueId).single();
      league = data;
    } else {
      const { data } = await supabase.from('premier_leagues').select('*').or('status.eq.active,status.eq.upcoming').order('created_at', { ascending: false }).limit(1).single();
      league = data;
    }
    if (!league) return NextResponse.json({ error: 'No league found' }, { status: 404 });

    const player = (await supabase.from('profiles').select('id, username, display_name, avatar_url, country, rating').eq('id', playerId).single()).data;
    if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 });

    const { data: rawStandings } = await supabase.from('league_standings').select('*').eq('league_id', league.id);
    const standings = (rawStandings || []).sort((a: any, b: any) => (a.position || 999) - (b.position || 999));
    const myStanding = standings.find((s: any) => s.player_id === playerId);
    if (!myStanding) return NextResponse.json({ error: 'Player not in this league' }, { status: 404 });
    const leader = standings[0];

    const { data: allFixtures } = await supabase.from('league_fixtures').select('*').eq('league_id', league.id);
    const fixtures = (allFixtures || []) as any[];
    const myPlayed = fixtures.filter(f => f.played && (f.home_player_id === playerId || f.away_player_id === playerId)).sort((a, b) => a.matchday - b.matchday);
    const myUpcoming = fixtures.filter(f => !f.played && (f.home_player_id === playerId || f.away_player_id === playerId)).sort((a, b) => a.matchday - b.matchday);
    const nextFixture = myUpcoming[0] || null;
    const nextOpponentId = nextFixture ? (nextFixture.home_player_id === playerId ? nextFixture.away_player_id : nextFixture.home_player_id) : null;
    const nextOpponent = nextOpponentId ? (await supabase.from('profiles').select('id, display_name, avatar_url, country, rating').eq('id', nextOpponentId).single()).data : null;
    const leaderPlayer = leader ? (await supabase.from('profiles').select('display_name').eq('id', leader.player_id).single()).data : null;

    // Recent results
    const recentOpponentIds = myPlayed.slice(-5).map((f: any) => f.home_player_id === playerId ? f.away_player_id : f.home_player_id);
    const { data: recentOpponents } = await supabase.from('profiles').select('id, display_name, rating').in('id', recentOpponentIds);
    const oppMap = new Map<string, any>();
    (recentOpponents || []).forEach((p: any) => oppMap.set(p.id, p));
    const recentResults = myPlayed.slice(-5).map((f: any) => {
      const oppId = f.home_player_id === playerId ? f.away_player_id : f.home_player_id;
      let myResult = 'draw';
      if (f.result === 'home_win') myResult = f.home_player_id === playerId ? 'win' : 'loss';
      else if (f.result === 'away_win') myResult = f.away_player_id === playerId ? 'win' : 'loss';
      return { matchday: f.matchday, opponent: oppMap.get(oppId), result: myResult, fixtureId: f.id };
    });

    const streak = getStreak(myStanding.form || []);
    const pointsBehind = (leader?.points || 0) - (myStanding.points || 0);

    return NextResponse.json({
      success: true,
      player, league: { ...league, currentMatchday: league.current_matchday, totalMatchdays: league.total_matchdays },
      standing: myStanding,
      streak,
      distanceFromLeader: { points: pointsBehind, leaderPoints: leader?.points || 0, leaderName: leaderPlayer?.display_name || 'Unknown' },
      nextMatch: nextFixture ? { matchday: nextFixture.matchday, fixtureId: nextFixture.id, isHome: nextFixture.home_player_id === playerId, opponent: nextOpponent } : null,
      recentResults,
      remainingFixtures: myUpcoming.length,
      totalPlayers: standings.length,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
