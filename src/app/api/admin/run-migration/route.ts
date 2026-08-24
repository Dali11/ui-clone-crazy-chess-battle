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

    await client.end();

    const allOk = results.every((r: any) => r.ok);
    return NextResponse.json({ success: allOk, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
