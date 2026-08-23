import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

    const notifications: any[] = [];
    const { data: allFixtures } = await supabase.from('league_fixtures').select('*').eq('league_id', league.id);
    const myFixtures = (allFixtures || []).filter((f: any) => f.home_player_id === playerId || f.away_player_id === playerId);
    const upcoming = myFixtures.filter((f: any) => !f.played).sort((a: any, b: any) => a.matchday - b.matchday);

    if (upcoming.length > 0) {
      const next = upcoming[0];
      const oppId = next.home_player_id === playerId ? next.away_player_id : next.home_player_id;
      const opp = (await supabase.from('profiles').select('display_name').eq('id', oppId).single()).data;
      const isHome = next.home_player_id === playerId;
      notifications.push({ type: 'upcoming_match', priority: 'high', title: 'Upcoming Match', message: `Matchday ${next.matchday}: You (${isHome ? 'Home' : 'Away'}) vs ${opp?.display_name || 'TBD'}`, matchday: next.matchday, fixtureId: next.id });
    }

    const recent = myFixtures.filter((f: any) => f.played).sort((a: any, b: any) => b.matchday - a.matchday).slice(0, 3);
    for (const f of recent) {
      const oppId = f.home_player_id === playerId ? f.away_player_id : f.home_player_id;
      const opp = (await supabase.from('profiles').select('display_name').eq('id', oppId).single()).data;
      let result = 'Drew';
      if (f.result === 'home_win') result = f.home_player_id === playerId ? 'Won' : 'Lost';
      else if (f.result === 'away_win') result = f.away_player_id === playerId ? 'Won' : 'Lost';
      notifications.push({ type: 'result', priority: 'medium', title: `Matchday ${f.matchday} Result`, message: `${result} vs ${opp?.display_name || 'TBD'}`, matchday: f.matchday, fixtureId: f.id });
    }

    const { data: myStanding } = await supabase.from('league_standings').select('*').eq('league_id', league.id).eq('player_id', playerId).single();
    if (myStanding && myStanding.previous_position && myStanding.previous_position !== myStanding.position) {
      const direction = myStanding.previous_position > myStanding.position ? 'up' : 'down';
      notifications.push({ type: 'position_change', priority: 'medium', title: 'Position Change', message: `You moved ${direction} to #${myStanding.position} (${direction === 'up' ? '+' : '-'}${Math.abs(myStanding.previous_position - myStanding.position)})` });
    }
    if (league.qualifying_spots && myStanding) {
      if (myStanding.position <= league.qualifying_spots) notifications.push({ type: 'qualification', priority: 'high', title: 'Qualification Zone', message: `You're in the qualification zone at #${myStanding.position}` });
      else if (myStanding.position === league.qualifying_spots + 1) notifications.push({ type: 'qualification', priority: 'medium', title: 'On the Bubble', message: `You're 1 spot outside qualification at #${myStanding.position}` });
    }

    return NextResponse.json({ success: true, playerId, leagueId: league.id, notifications });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
