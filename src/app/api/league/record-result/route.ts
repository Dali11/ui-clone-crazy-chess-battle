import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recalcStandings } from '@/lib/league/engine';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const adminCheck = createAdminClient();
    const { data: profile } = await adminCheck.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { leagueId, fixtureId, result } = await request.json();
    if (!leagueId || !fixtureId) return NextResponse.json({ error: 'Missing leagueId or fixtureId' }, { status: 400 });
    if (!result || !['home_win', 'away_win', 'draw'].includes(result)) return NextResponse.json({ error: 'Invalid result' }, { status: 400 });

    const admin = createAdminClient();
    await admin.from('league_fixtures').update({ result, played: true, updated_at: new Date().toISOString() }).eq('id', fixtureId);
    const standings = await recalcStandings(admin, leagueId);

    return NextResponse.json({ success: true, leagueId, fixtureId, result, standings });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
