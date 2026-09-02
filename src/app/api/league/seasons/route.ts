import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient();
    const leagueId = request.nextUrl.searchParams.get('leagueId');

    let query = supabase
      .from('league_season_archives')
      .select('*')
      .order('completed_at', { ascending: false });

    if (leagueId) {
      query = query.eq('league_id', leagueId);
    }

    const { data: archives, error } = await query;
    if (error) throw error;

    const leagueIds = [...new Set((archives || []).map((a: any) => a.league_id).filter(Boolean))];
    const playerIds = [
      ...new Set(
        (archives || []).flatMap((a: any) =>
          [a.champion_player_id, a.runner_up_player_id].filter(Boolean)
        )
      ),
    ];

    const leagueMap = new Map<string, any>();
    if (leagueIds.length > 0) {
      const { data: leagues } = await supabase
        .from('premier_leagues')
        .select('id, name, tier, country')
        .in('id', leagueIds);
      (leagues || []).forEach((l: any) => leagueMap.set(l.id, l));
    }

    const playerMap = new Map<string, any>();
    if (playerIds.length > 0) {
      const { data: players } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, country, rating')
        .in('id', playerIds);
      (players || []).forEach((p: any) => playerMap.set(p.id, p));
    }

    const enriched = (archives || []).map((a: any) => ({
      id: a.id,
      league_id: a.league_id,
      league_name: leagueMap.get(a.league_id)?.name || 'Unknown League',
      league_tier: leagueMap.get(a.league_id)?.tier || null,
      season_id: a.season_id,
      completed_at: a.completed_at,
      champion: a.champion_player_id ? playerMap.get(a.champion_player_id) : null,
      runner_up: a.runner_up_player_id ? playerMap.get(a.runner_up_player_id) : null,
      final_standings: a.final_standings || [],
    }));

    return NextResponse.json({ success: true, seasons: enriched });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
