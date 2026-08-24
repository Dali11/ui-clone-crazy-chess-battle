import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const supabase = createAdminClient();

    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token).catch(() => ({ data: { user: null } }));

    let isAdmin = false;
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();
      isAdmin = !!profile?.is_admin;
    }

    // Fetch all premium competitions
    const { data: competitions, error } = await supabase
      .from('premium_competitions')
      .select(`
        id, name, type, description, sponsor_name, sponsor_logo_url,
        format, qualification_config, prize_pool_cents, prize_currency,
        status, starts_at, ends_at, requires_membership, min_rating, max_rating,
        eligibility_config, created_at
      `)
      .order('starts_at', { ascending: true, nullsFirst: false });

    if (error) throw error;

    // For each competition, get participants and fixtures summary
    const competitionsWithDetails = await Promise.all(
      (competitions || []).map(async (comp: any) => {
        const { count: participantCount } = await supabase
          .from('premium_competition_participants')
          .select('*', { count: 'exact', head: true })
          .eq('competition_id', comp.id);

        const { data: fixtures } = await supabase
          .from('premium_competition_fixtures')
          .select('id, stage, played, home_player_id, away_player_id, result')
          .eq('competition_id', comp.id);

        const stageCounts: Record<string, { total: number; played: number }> = {};
        (fixtures || []).forEach((f: any) => {
          if (!stageCounts[f.stage]) stageCounts[f.stage] = { total: 0, played: 0 };
          stageCounts[f.stage].total++;
          if (f.played) stageCounts[f.stage].played++;
        });

        return {
          ...comp,
          participantCount: participantCount || 0,
          stages: stageCounts,
        };
      })
    );

    return NextResponse.json({
      success: true,
      isAdmin,
      competitions: competitionsWithDetails,
    });
  } catch (error: any) {
    console.error('Premium competitions API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
