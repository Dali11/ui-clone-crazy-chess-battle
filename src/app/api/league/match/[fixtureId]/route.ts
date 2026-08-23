import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getH2H } from '@/lib/league/engine';

export async function GET(request: NextRequest, { params }: { params: Promise<{ fixtureId: string }> }) {
  try {
    const { fixtureId } = await params;
    const supabase = createAdminClient();
    const { data: fixture } = await supabase.from('league_fixtures').select('*').eq('id', fixtureId).single();
    if (!fixture) return NextResponse.json({ error: 'Fixture not found' }, { status: 404 });

    const { data: league } = await supabase.from('premier_leagues').select('id, name, country').eq('id', fixture.league_id).single();
    const homePlayer = fixture.home_player_id ? (await supabase.from('profiles').select('id, username, display_name, avatar_url, country, rating').eq('id', fixture.home_player_id).single()).data : null;
    const awayPlayer = fixture.away_player_id ? (await supabase.from('profiles').select('id, username, display_name, avatar_url, country, rating').eq('id', fixture.away_player_id).single()).data : null;
    const h2h = await getH2H(supabase, fixture.home_player_id, fixture.away_player_id);
    const status = fixture.played ? 'completed' : 'scheduled';
    let resultText = 'Pending';
    if (fixture.result === 'home_win') resultText = `${homePlayer?.display_name || 'Home'} wins`;
    else if (fixture.result === 'away_win') resultText = `${awayPlayer?.display_name || 'Away'} wins`;
    else if (fixture.result === 'draw') resultText = 'Draw';

    return NextResponse.json({
      success: true,
      fixture, league, status, resultText,
      home_player: homePlayer, away_player: awayPlayer,
      headToHead: { ...h2h, p1Name: homePlayer?.display_name, p2Name: awayPlayer?.display_name },
      watchUrl: homePlayer?.username && awayPlayer?.username ? 'https://www.chess.com/live' : null,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
