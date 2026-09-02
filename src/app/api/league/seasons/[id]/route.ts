import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createAdminClient();

    const { data: archive, error } = await supabase
      .from('league_season_archives')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !archive) {
      return NextResponse.json({ error: 'Season archive not found' }, { status: 404 });
    }

    const { data: league } = await supabase
      .from('premier_leagues')
      .select('id, name, tier, country')
      .eq('id', archive.league_id)
      .single();

    const standings = (archive.final_standings || []) as any[];
    const playerIds = [
      ...new Set([
        ...standings.map((s: any) => s.player_id).filter(Boolean),
        archive.champion_player_id,
        archive.runner_up_player_id,
      ].filter(Boolean)),
    ];

    const playerMap = new Map<string, any>();
    if (playerIds.length > 0) {
      const { data: players } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url, country, rating')
        .in('id', playerIds);
      (players || []).forEach((p: any) => playerMap.set(p.id, p));
    }

    const enrichedStandings = standings.map((s: any) => ({
      ...s,
      player: playerMap.get(s.player_id) || null,
    }));

    return NextResponse.json({
      success: true,
      archive: {
        id: archive.id,
        league_id: archive.league_id,
        league_name: league?.name || 'Unknown League',
        league_tier: league?.tier || null,
        season_id: archive.season_id,
        completed_at: archive.completed_at,
        champion: archive.champion_player_id ? playerMap.get(archive.champion_player_id) : null,
        runner_up: archive.runner_up_player_id ? playerMap.get(archive.runner_up_player_id) : null,
        final_standings: enrichedStandings,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
