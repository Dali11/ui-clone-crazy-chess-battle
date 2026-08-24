import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });
    }

    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbUrl });
    await client.connect();

    const results: any[] = [];

    // Add columns to premier_leagues
    const alterStatements = [
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS entry_type TEXT NOT NULL DEFAULT 'free'`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS registration_deadline TIMESTAMPTZ`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS description TEXT`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS banner_url TEXT`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS min_rating INT DEFAULT 0`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS max_rating INT`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS requires_qualification BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS qualifier_tournament_id UUID`,
    ];

    for (const sql of alterStatements) {
      try {
        await client.query(sql);
        results.push({ ok: true, sql: sql.substring(0, 70) });
      } catch (e: any) {
        results.push({ ok: false, error: e.message, sql: sql.substring(0, 70) });
      }
    }

    // Drop old status constraint and add new one
    try {
      await client.query(`ALTER TABLE premier_leagues DROP CONSTRAINT IF EXISTS premier_leagues_status_check`);
      await client.query(`ALTER TABLE premier_leagues ADD CONSTRAINT premier_leagues_status_check CHECK (status IN ('upcoming', 'registration', 'active', 'completed'))`);
      results.push({ ok: true, sql: 'Update status constraint' });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: 'Update status constraint' });
    }

    // Create league_registrations table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS league_registrations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          league_id UUID NOT NULL REFERENCES premier_leagues(id) ON DELETE CASCADE,
          player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'withdrawn')),
          qualified BOOLEAN NOT NULL DEFAULT FALSE,
          qualification_reason TEXT,
          registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          reviewed_at TIMESTAMPTZ,
          reviewed_by UUID REFERENCES profiles(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(league_id, player_id)
        )
      `);
      results.push({ ok: true, sql: 'Create league_registrations table' });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: 'Create league_registrations table' });
    }

    // Create indexes
    const indexes = [
      `CREATE INDEX IF NOT EXISTS idx_league_registrations_league_id ON league_registrations(league_id)`,
      `CREATE INDEX IF NOT EXISTS idx_league_registrations_player_id ON league_registrations(player_id)`,
      `CREATE INDEX IF NOT EXISTS idx_league_registrations_status ON league_registrations(status)`,
    ];
    for (const sql of indexes) {
      try {
        await client.query(sql);
        results.push({ ok: true, sql: sql.substring(0, 70) });
      } catch (e: any) {
        results.push({ ok: false, error: e.message, sql: sql.substring(0, 70) });
      }
    }

    // Create memberships table
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS memberships (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'expired', 'cancelled', 'pending')),
          billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'yearly')),
          price NUMERIC(10, 2) NOT NULL DEFAULT 0,
          currency TEXT NOT NULL DEFAULT 'MWK',
          country TEXT NOT NULL DEFAULT 'MW',
          start_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          end_date TIMESTAMPTZ NOT NULL,
          auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
          payment_method TEXT,
          payment_reference TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      results.push({ ok: true, sql: 'Create memberships table' });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: 'Create memberships table' });
    }

    // Membership indexes
    try {
      await client.query(`CREATE INDEX IF NOT EXISTS idx_memberships_player_id ON memberships(player_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_memberships_status ON memberships(status)`);
      results.push({ ok: true, sql: 'Create membership indexes' });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: 'Create membership indexes' });
    }

    // Create helper functions
    try {
      await client.query(`
        CREATE OR REPLACE FUNCTION has_active_membership(p_player_id UUID)
        RETURNS BOOLEAN AS $$
        BEGIN
          RETURN EXISTS (
            SELECT 1 FROM memberships
            WHERE player_id = p_player_id
              AND status = 'active'
              AND end_date > NOW()
          );
        END;
        $$ LANGUAGE plpgsql
      `);
      results.push({ ok: true, sql: 'Create has_active_membership function' });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: 'Create has_active_membership function' });
    }

    try {
      await client.query(`
        CREATE OR REPLACE FUNCTION is_registered_for_league(p_league_id UUID, p_player_id UUID)
        RETURNS BOOLEAN AS $$
        BEGIN
          RETURN EXISTS (
            SELECT 1 FROM league_registrations
            WHERE league_id = p_league_id
              AND player_id = p_player_id
              AND status IN ('pending', 'approved')
          );
        END;
        $$ LANGUAGE plpgsql
      `);
      results.push({ ok: true, sql: 'Create is_registered_for_league function' });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: 'Create is_registered_for_league function' });
    }

    // Create update trigger
    try {
      await client.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      await client.query(`DROP TRIGGER IF EXISTS update_league_registrations_updated_at ON league_registrations`);
      await client.query(`CREATE TRIGGER update_league_registrations_updated_at BEFORE UPDATE ON league_registrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);
      await client.query(`DROP TRIGGER IF EXISTS update_memberships_updated_at ON memberships`);
      await client.query(`CREATE TRIGGER update_memberships_updated_at BEFORE UPDATE ON memberships FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);
      results.push({ ok: true, sql: 'Create triggers' });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: 'Create triggers' });
    }

    // Create market_config table — configurable per-country currency & membership pricing
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS market_config (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          country_code TEXT NOT NULL UNIQUE,
          country_name TEXT NOT NULL,
          currency_code TEXT NOT NULL,
          currency_symbol TEXT NOT NULL DEFAULT '',
          membership_active BOOLEAN NOT NULL DEFAULT true,
          membership_price_cents INT NOT NULL DEFAULT 0,
          membership_currency TEXT NOT NULL,
          is_default BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_market_config_country ON market_config(country_code)`);
      results.push({ ok: true, sql: 'Create market_config table' });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: 'Create market_config table' });
    }

    // Seed default market: Malawi / MWK (config, not competitive-entity seed data)
    try {
      await client.query(`
        INSERT INTO market_config (country_code, country_name, currency_code, currency_symbol, membership_active, membership_price_cents, membership_currency, is_default)
        VALUES ('MW', 'Malawi', 'MWK', 'MK', true, 1000000, 'MWK', true)
        ON CONFLICT (country_code) DO NOTHING
      `);
      results.push({ ok: true, sql: 'Seed MW market_config' });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: 'Seed MW market_config' });
    }

    // market_config RLS
    try {
      await client.query(`ALTER TABLE market_config ENABLE ROW LEVEL SECURITY`);
      await client.query(`DROP POLICY IF EXISTS "Market config is public" ON market_config`);
      await client.query(`CREATE POLICY "Market config is public" ON market_config FOR SELECT USING (true)`);
      await client.query(`DROP POLICY IF EXISTS "Admins can manage market config" ON market_config`);
      await client.query(`
        CREATE POLICY "Admins can manage market config" ON market_config FOR ALL TO authenticated USING (
          EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
        ) WITH CHECK (
          EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
        )
      `);
      results.push({ ok: true, sql: 'market_config RLS policies' });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: 'market_config RLS policies' });
    }


    // ============================================================
    // Migration 030: Tiered leagues, gender divisions, verification fields
    // ============================================================
    const migration030Statements = [
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender TEXT CHECK (gender IN ('male', 'female', 'other', 'prefer_not_to_say'))`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_number TEXT`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS identity_verification_method TEXT`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS chesscom_verified BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS games_played INT NOT NULL DEFAULT 0`,
      `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`,
      `CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles(gender)`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS tier INT NOT NULL DEFAULT 1`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS gender_restriction TEXT NOT NULL DEFAULT 'open' CHECK (gender_restriction IN ('male', 'female', 'open'))`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS promotes_count INT NOT NULL DEFAULT 2`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS relegates_count INT NOT NULL DEFAULT 2`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS min_games_played INT NOT NULL DEFAULT 0`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS min_account_age_days INT NOT NULL DEFAULT 0`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS requires_identity_verification BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS requires_phone_verification BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS requires_chesscom_verification BOOLEAN NOT NULL DEFAULT FALSE`,
      `CREATE INDEX IF NOT EXISTS idx_premier_leagues_tier ON premier_leagues(tier)`,
      `CREATE INDEX IF NOT EXISTS idx_premier_leagues_gender ON premier_leagues(gender_restriction)`,
    ];
    for (const sql of migration030Statements) {
      try {
        await client.query(sql);
        results.push({ ok: true, sql: sql.substring(0, 70) });
      } catch (e: any) {
        results.push({ ok: false, error: e.message, sql: sql.substring(0, 70) });
      }
    }

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS player_qualifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          league_id UUID REFERENCES premier_leagues(id) ON DELETE CASCADE,
          profile_complete BOOLEAN NOT NULL DEFAULT FALSE,
          gender_selected BOOLEAN NOT NULL DEFAULT FALSE,
          phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
          identity_verified BOOLEAN NOT NULL DEFAULT FALSE,
          chesscom_linked BOOLEAN NOT NULL DEFAULT FALSE,
          min_games_met BOOLEAN NOT NULL DEFAULT FALSE,
          account_age_met BOOLEAN NOT NULL DEFAULT FALSE,
          membership_active BOOLEAN NOT NULL DEFAULT FALSE,
          rating_requirement_met BOOLEAN NOT NULL DEFAULT FALSE,
          gender_requirement_met BOOLEAN NOT NULL DEFAULT FALSE,
          all_requirements_met BOOLEAN NOT NULL DEFAULT FALSE,
          requirements_snapshot JSONB DEFAULT '{}',
          checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(player_id, league_id)
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_player_qualifications_player ON player_qualifications(player_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_player_qualifications_league ON player_qualifications(league_id)`);
      results.push({ ok: true, sql: 'Create player_qualifications table' });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: 'Create player_qualifications table' });
    }

    // ============================================================
    // Migration 032: Premium league prize pools + premium competitions
    // ============================================================
    const migration032AlterStatements = [
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS prize_pool_cents INT NOT NULL DEFAULT 0`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS prize_currency TEXT NOT NULL DEFAULT 'MWK'`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS qualifying_positions INT NOT NULL DEFAULT 10`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS payout_config JSONB DEFAULT NULL`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS season_duration_weeks INT NOT NULL DEFAULT 12`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS sponsor_name TEXT`,
      `ALTER TABLE premier_leagues ADD COLUMN IF NOT EXISTS sponsor_logo_url TEXT`,
    ];
    for (const sql of migration032AlterStatements) {
      try {
        await client.query(sql);
        results.push({ ok: true, sql: sql.substring(0, 70) });
      } catch (e: any) {
        results.push({ ok: false, error: e.message, sql: sql.substring(0, 70) });
      }
    }

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS premium_competitions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name TEXT NOT NULL,
          type TEXT NOT NULL DEFAULT 'custom' CHECK (type IN ('champions_league', 'shield', 'cup', 'custom')),
          description TEXT,
          sponsor_name TEXT,
          sponsor_logo_url TEXT,
          format JSONB NOT NULL DEFAULT '{}'::jsonb,
          qualification_config JSONB NOT NULL DEFAULT '{}'::jsonb,
          prize_pool_cents INT NOT NULL DEFAULT 0,
          prize_currency TEXT NOT NULL DEFAULT 'MWK',
          status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'registration', 'group_stage', 'knockouts', 'semi_finals', 'final', 'completed', 'cancelled')),
          starts_at TIMESTAMPTZ,
          ends_at TIMESTAMPTZ,
          season_id UUID REFERENCES premier_leagues(id) ON DELETE SET NULL,
          requires_membership BOOLEAN NOT NULL DEFAULT TRUE,
          min_rating INT DEFAULT 0,
          max_rating INT,
          eligibility_config JSONB DEFAULT NULL,
          created_by UUID REFERENCES profiles(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_premium_competitions_status ON premium_competitions(status)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_premium_competitions_type ON premium_competitions(type)`);
      results.push({ ok: true, sql: 'Create premium_competitions table' });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: 'Create premium_competitions table' });
    }

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS premium_competition_participants (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          competition_id UUID NOT NULL REFERENCES premium_competitions(id) ON DELETE CASCADE,
          player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          qualified_from_league_id UUID REFERENCES premier_leagues(id) ON DELETE SET NULL,
          qualified_from_tier INT,
          league_position INT,
          group_number INT,
          seed INT,
          status TEXT NOT NULL DEFAULT 'qualified' CHECK (status IN ('qualified', 'eliminated', 'champion', 'runner_up', 'third_place')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(competition_id, player_id)
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_pcp_competition ON premium_competition_participants(competition_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_pcp_player ON premium_competition_participants(player_id)`);
      results.push({ ok: true, sql: 'Create premium_competition_participants table' });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: 'Create premium_competition_participants table' });
    }

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS premium_competition_fixtures (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          competition_id UUID NOT NULL REFERENCES premium_competitions(id) ON DELETE CASCADE,
          stage TEXT NOT NULL DEFAULT 'group_stage' CHECK (stage IN ('group_stage', 'round_of_16', 'quarter_final', 'semi_final', 'third_place', 'final')),
          group_number INT,
          round INT NOT NULL DEFAULT 1,
          home_player_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
          away_player_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
          home_score INT,
          away_score INT,
          result TEXT,
          played BOOLEAN NOT NULL DEFAULT FALSE,
          scheduled_date TIMESTAMPTZ,
          next_fixture_id UUID REFERENCES premium_competition_fixtures(id) ON DELETE SET NULL,
          bracket_position INT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_pcf_competition ON premium_competition_fixtures(competition_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_pcf_stage ON premium_competition_fixtures(stage)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_pcf_players ON premium_competition_fixtures(home_player_id, away_player_id)`);
      results.push({ ok: true, sql: 'Create premium_competition_fixtures table' });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: 'Create premium_competition_fixtures table' });
    }

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS premium_competition_standings (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          competition_id UUID NOT NULL REFERENCES premium_competitions(id) ON DELETE CASCADE,
          player_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          group_number INT NOT NULL,
          position INT NOT NULL DEFAULT 1,
          played INT NOT NULL DEFAULT 0,
          wins INT NOT NULL DEFAULT 0,
          draws INT NOT NULL DEFAULT 0,
          losses INT NOT NULL DEFAULT 0,
          points INT NOT NULL DEFAULT 0,
          qualified BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(competition_id, player_id)
        )
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_pcs_competition ON premium_competition_standings(competition_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_pcs_group ON premium_competition_standings(competition_id, group_number)`);
      results.push({ ok: true, sql: 'Create premium_competition_standings table' });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: 'Create premium_competition_standings table' });
    }

    try {
      await client.query(`DROP TRIGGER IF EXISTS update_premium_competitions_updated_at ON premium_competitions`);
      await client.query(`CREATE TRIGGER update_premium_competitions_updated_at BEFORE UPDATE ON premium_competitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);
      await client.query(`DROP TRIGGER IF EXISTS update_premium_competition_fixtures_updated_at ON premium_competition_fixtures`);
      await client.query(`CREATE TRIGGER update_premium_competition_fixtures_updated_at BEFORE UPDATE ON premium_competition_fixtures FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);
      await client.query(`DROP TRIGGER IF EXISTS update_premium_competition_standings_updated_at ON premium_competition_standings`);
      await client.query(`CREATE TRIGGER update_premium_competition_standings_updated_at BEFORE UPDATE ON premium_competition_standings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`);
      results.push({ ok: true, sql: 'Create premium competition triggers' });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: 'Create premium competition triggers' });
    }

    // RLS for premium competition tables
    const premiumRlsStatements = [
      `ALTER TABLE premium_competitions ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS "Premium competitions visible to authenticated" ON premium_competitions`,
      `CREATE POLICY "Premium competitions visible to authenticated" ON premium_competitions FOR SELECT TO authenticated USING (true)`,
      `DROP POLICY IF EXISTS "Admins manage premium competitions" ON premium_competitions`,
      `CREATE POLICY "Admins manage premium competitions" ON premium_competitions FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))`,
      `ALTER TABLE premium_competition_participants ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS "Participants visible to authenticated" ON premium_competition_participants`,
      `CREATE POLICY "Participants visible to authenticated" ON premium_competition_participants FOR SELECT TO authenticated USING (true)`,
      `DROP POLICY IF EXISTS "Admins manage participants" ON premium_competition_participants`,
      `CREATE POLICY "Admins manage participants" ON premium_competition_participants FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))`,
      `ALTER TABLE premium_competition_fixtures ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS "Fixtures visible to authenticated" ON premium_competition_fixtures`,
      `CREATE POLICY "Fixtures visible to authenticated" ON premium_competition_fixtures FOR SELECT TO authenticated USING (true)`,
      `DROP POLICY IF EXISTS "Admins manage fixtures" ON premium_competition_fixtures`,
      `CREATE POLICY "Admins manage fixtures" ON premium_competition_fixtures FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))`,
      `ALTER TABLE premium_competition_standings ENABLE ROW LEVEL SECURITY`,
      `DROP POLICY IF EXISTS "Standings visible to authenticated" ON premium_competition_standings`,
      `CREATE POLICY "Standings visible to authenticated" ON premium_competition_standings FOR SELECT TO authenticated USING (true)`,
      `DROP POLICY IF EXISTS "Admins manage standings" ON premium_competition_standings`,
      `CREATE POLICY "Admins manage standings" ON premium_competition_standings FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)) WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true))`,
    ];
    for (const sql of premiumRlsStatements) {
      try {
        await client.query(sql);
        results.push({ ok: true, sql: sql.substring(0, 70) });
      } catch (e: any) {
        results.push({ ok: false, error: e.message, sql: sql.substring(0, 70) });
      }
    }

    // Seed the 5 default league tiers ONLY if premier_leagues is empty (admin can rename/reconfigure anytime)
    try {
      const { rows } = await client.query(`SELECT COUNT(*)::int AS c FROM premier_leagues`);
      if (rows[0].c === 0) {
        await client.query(`
          INSERT INTO premier_leagues
            (name, status, country, league_size, tier, gender_restriction, entry_type,
             promotes_count, relegates_count, qualifying_positions,
             prize_pool_cents, prize_currency, season_duration_weeks, payout_config)
          VALUES
            ('CrazyChess Premier League', 'upcoming', 'MW', 100, 1, 'open', 'membership', 0, 5, 10, 50000000, 'MWK', 12, '{"1": 0.40, "2": 0.25, "3": 0.15, "4": 0.12, "5": 0.08}'::jsonb),
            ('CrazyChess Championship', 'upcoming', 'MW', 100, 2, 'open', 'membership', 5, 5, 10, 40000000, 'MWK', 12, '{"1": 0.40, "2": 0.25, "3": 0.15, "4": 0.12, "5": 0.08}'::jsonb),
            ('CrazyChess Bronze League', 'upcoming', 'MW', 100, 3, 'open', 'membership', 5, 5, 10, 30000000, 'MWK', 12, '{"1": 0.40, "2": 0.25, "3": 0.15, "4": 0.12, "5": 0.08}'::jsonb),
            ('CrazyChess Amateur League', 'upcoming', 'MW', 100, 4, 'open', 'free', 5, 0, 10, 0, 'MWK', 12, NULL),
            ('CrazyChess Open League', 'registration', 'MW', 200, 5, 'open', 'free', 10, 0, 10, 0, 'MWK', 12, NULL)
        `);
        results.push({ ok: true, sql: 'Seed 5 default league tiers (table was empty)' });
      } else {
        results.push({ ok: true, sql: `Skip league seed — ${rows[0].c} leagues already exist` });
      }
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: 'Seed default league tiers' });
    }

    await client.end();

    const allOk = results.every((r: any) => r.ok);
    return NextResponse.json({ success: allOk, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
