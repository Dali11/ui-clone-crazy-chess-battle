import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const { leagueId } = await request.json();
    if (!leagueId) return NextResponse.json({ error: 'Missing leagueId' }, { status: 400 });
    const supabase = createAdminClient();
    const { data: league } = await supabase.from('premier_leagues').select('*').eq('id', leagueId).single();
    if (!league) return NextResponse.json({ error: 'League not found' }, { status: 404 });

    const current = league.current_matchday || 1;
    const total = league.total_matchdays || 1;
    if (current >= total) {
      await supabase.from('premier_leagues').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', leagueId);
      return NextResponse.json({ success: true, message: 'League season completed!', status: 'completed' });
    }

    const next = current + 1;
    await supabase.from('premier_leagues').update({ current_matchday: next, updated_at: new Date().toISOString() }).eq('id', leagueId);
    const { data: fixtures } = await supabase.from('league_fixtures').select('*').eq('league_id', leagueId).eq('matchday', next);

    return NextResponse.json({ success: true, leagueId, currentMatchday: next, totalMatchdays: total, fixtures });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
