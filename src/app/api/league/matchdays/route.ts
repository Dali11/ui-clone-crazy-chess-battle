import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
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

    const { data: allFixtures } = await supabase.from('league_fixtures').select('*').eq('league_id', league.id);
    const fixtures = (allFixtures || []) as any[];
    const totalMatchdays = league.total_matchdays || 0;
    const currentMatchday = league.current_matchday || 1;
    const matchdays: any[] = [];
    for (let md = 1; md <= totalMatchdays; md++) {
      const mdFixtures = fixtures.filter(f => f.matchday === md);
      const allPlayed = mdFixtures.length > 0 && mdFixtures.every(f => f.played);
      const somePlayed = mdFixtures.some(f => f.played);
      const status = allPlayed ? 'completed' : somePlayed ? 'live' : md < currentMatchday ? 'missed' : 'upcoming';
      matchdays.push({ matchday: md, status, totalFixtures: mdFixtures.length, playedFixtures: mdFixtures.filter(f => f.played).length, isCurrent: md === currentMatchday });
    }
    return NextResponse.json({ success: true, league: { id: league.id, name: league.name, currentMatchday, totalMatchdays }, matchdays });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
