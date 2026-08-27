import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

// GET — List all premium competitions (public read, admin sees everything the same way)
export async function GET() {
  try {
    const supabase = await createClient();
    const admin = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();

    let isAdmin = false;
    if (user) {
      const { data: profile } = await admin
        .from('profiles')
        .select('is_admin')
        .eq('id', user.id)
        .single();
      isAdmin = !!profile?.is_admin;
    }

    const { data: competitions, error } = await admin
      .from('premium_competitions')
      .select(`
        id, name, type, description, sponsor_name, sponsor_logo_url,
        format, qualification_config, prize_pool, prize_currency,
        status, starts_at, ends_at, requires_membership, min_rating, max_rating,
        eligibility_config, created_at
      `)
      .order('starts_at', { ascending: true, nullsFirst: false });

    if (error) throw error;

    const competitionsWithDetails = await Promise.all(
      (competitions || []).map(async (comp: any) => {
        const { count: participantCount } = await admin
          .from('premium_competition_participants')
          .select('*', { count: 'exact', head: true })
          .eq('competition_id', comp.id);

        const { data: fixtures } = await admin
          .from('premium_competition_fixtures')
          .select('id, stage, played, home_player_id, away_player_id, result')
          .eq('competition_id', comp.id);

        const stageCounts: Record<string, { total: number; played: number }> = {};
        (fixtures || []).forEach((f: any) => {
          if (!stageCounts[f.stage]) stageCounts[f.stage] = { total: 0, played: 0 };
          stageCounts[f.stage].total++;
          if (f.played) stageCounts[f.stage].played++;
        });

        return { ...comp, participantCount: participantCount || 0, stages: stageCounts };
      })
    );

    return NextResponse.json({ success: true, isAdmin, competitions: competitionsWithDetails });
  } catch (error: any) {
    console.error('Premium competitions API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST — Create a new premium competition (admin only)
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { name, type, description, sponsor_name, sponsor_logo_url, format,
      qualification_config, prize_pool, prize_currency, status,
      starts_at, ends_at, requires_membership, min_rating, max_rating } = body;

    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const { data, error } = await admin
      .from('premium_competitions')
      .insert({
        name,
        type: type || 'custom',
        description: description || null,
        sponsor_name: sponsor_name || null,
        sponsor_logo_url: sponsor_logo_url || null,
        format: format || {},
        qualification_config: qualification_config || {},
        prize_pool: prize_pool || 0,
        prize_currency: prize_currency || 'MWK',
        status: status || 'upcoming',
        starts_at: starts_at || null,
        ends_at: ends_at || null,
        requires_membership: requires_membership ?? true,
        min_rating: min_rating || 0,
        max_rating: max_rating || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, competition: data });
  } catch (error: any) {
    console.error('Create premium competition error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH — Update a premium competition (admin only)
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const allowedFields = ['name', 'type', 'description', 'sponsor_name', 'sponsor_logo_url',
      'format', 'qualification_config', 'prize_pool', 'prize_currency', 'status',
      'starts_at', 'ends_at', 'requires_membership', 'min_rating', 'max_rating', 'eligibility_config'];
    const cleanUpdates: Record<string, any> = {};
    for (const key of allowedFields) {
      if (key in updates) cleanUpdates[key] = updates[key];
    }
    cleanUpdates.updated_at = new Date().toISOString();

    const { data, error } = await admin
      .from('premium_competitions')
      .update(cleanUpdates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, competition: data });
  } catch (error: any) {
    console.error('Update premium competition error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE — Remove a premium competition (admin only)
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from('profiles').select('is_admin').eq('id', user.id).single();
    if (!profile?.is_admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

    const { error } = await admin.from('premium_competitions').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
