import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recalcStandings } from '@/lib/league/engine';

export async function POST(request: NextRequest) {
  try {
    const { leagueId, fixtureId, result } = await request.json();
    if (!leagueId || !fixtureId) return NextResponse.json({ error: 'Missing leagueId or fixtureId' }, { status: 400 });
    if (!result || !['home_win', 'away_win', 'draw'].includes(result)) return NextResponse.json({ error: 'Invalid result' }, { status: 400 });

    const supabase = createAdminClient();
    await supabase.from('league_fixtures').update({ result, played: true, updated_at: new Date().toISOString() }).eq('id', fixtureId);
    const standings = await recalcStandings(supabase, leagueId);

    return NextResponse.json({ success: true, leagueId, fixtureId, result, standings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
