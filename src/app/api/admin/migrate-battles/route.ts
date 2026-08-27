import { NextRequest, NextResponse } from "next/server";

/**
 * Tries multiple Supabase pooler regions to find the correct one.
 * Protected by CRON_SECRET.
 */

const MIGRATION_SQL = `-- ============================================================
-- Chess Battles tables + wallet functions + withdrawals
-- ============================================================

CREATE TABLE IF NOT EXISTS battle_config (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enabled         BOOLEAN NOT NULL DEFAULT true,
  stake_levels     JSONB NOT NULL DEFAULT '[50000, 100000, 250000, 500000, 1000000]'::jsonb,
  platform_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 10.00,
  rating_range     INT NOT NULL DEFAULT 200,
  queue_timeout_s  INT NOT NULL DEFAULT 120,
  initial_minutes  INT NOT NULL DEFAULT 5,
  increment_seconds INT NOT NULL DEFAULT 2,
  armageddon_pct   INT NOT NULL DEFAULT 50,
  max_armageddon_rounds INT NOT NULL DEFAULT 3,
  disconnect_timeout_s INT NOT NULL DEFAULT 30,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO battle_config (id) VALUES (gen_random_uuid()) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS battle_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stake     INT NOT NULL,
  rating          INT NOT NULL DEFAULT 1200,
  status          TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched', 'expired', 'left')),
  battle_id       UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  matched_at       TIMESTAMPTZ,
  UNIQUE (player_id, stake, status)
);

CREATE TABLE IF NOT EXISTS battles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  white_player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  black_player_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stake     INT NOT NULL,
  pot       INT NOT NULL,
  platform_fee INT NOT NULL DEFAULT 0,
  winner_payout INT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'playing', 'completed', 'draw_armageddon', 'cancelled', 'disputed')),
  game_id         UUID REFERENCES games(id),
  armageddon_game_id UUID REFERENCES games(id),
  armageddon_round INT NOT NULL DEFAULT 0,
  winner_id       UUID REFERENCES auth.users(id),
  result          TEXT,
  white_rating    INT,
  black_rating    INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  settled         BOOLEAN NOT NULL DEFAULT false,
  notes           TEXT
);

CREATE INDEX IF NOT EXISTS idx_battle_queue_stake ON battle_queue(stake, status);
CREATE INDEX IF NOT EXISTS idx_battle_queue_player ON battle_queue(player_id);
CREATE INDEX IF NOT EXISTS idx_battles_status ON battles(status);
CREATE INDEX IF NOT EXISTS idx_battles_players ON battles(white_player_id, black_player_id);

ALTER TABLE battle_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE battles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read battle_config" ON battle_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users read own queue entries" ON battle_queue FOR SELECT TO authenticated USING (player_id = auth.uid());
CREATE POLICY "Users insert own queue entries" ON battle_queue FOR INSERT TO authenticated WITH CHECK (player_id = auth.uid());
CREATE POLICY "Users update own queue entries" ON battle_queue FOR UPDATE TO authenticated USING (player_id = auth.uid());
CREATE POLICY "Users delete own queue entries" ON battle_queue FOR DELETE TO authenticated USING (player_id = auth.uid());
CREATE POLICY "Players read own battles" ON battles FOR SELECT TO authenticated USING (white_player_id = auth.uid() OR black_player_id = auth.uid());

CREATE TABLE IF NOT EXISTS battle_escrow (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_id       UUID REFERENCES battles(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount    INT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'released', 'refunded')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at     TIMESTAMPTZ
);
ALTER TABLE battle_escrow ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players read own escrow" ON battle_escrow FOR SELECT TO authenticated USING (player_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'wallet_balance'
  ) THEN
    ALTER TABLE profiles ADD COLUMN wallet_balance INT NOT NULL DEFAULT 0;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.credit_wallet(p_user_id UUID, p_amount INT)
RETURNS VOID AS $$
BEGIN
  UPDATE profiles SET wallet_balance = wallet_balance + p_amount WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.debit_wallet(p_user_id UUID, p_amount INT)
RETURNS VOID AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE id = p_user_id AND wallet_balance >= p_amount
  ) THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  UPDATE profiles SET wallet_balance = wallet_balance - p_amount WHERE id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.credit_wallet(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debit_wallet(UUID, INT) TO authenticated;

CREATE TABLE IF NOT EXISTS withdrawals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount    INT NOT NULL,
  phone           TEXT NOT NULL,
  operator_name   TEXT NOT NULL,
  operator_ref_id TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'failed')),
  admin_notes     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own withdrawals" ON withdrawals FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own withdrawals" ON withdrawals FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins read all withdrawals" ON withdrawals FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);
CREATE POLICY "Admins update all withdrawals" ON withdrawals FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
);

-- chess_level column for profiles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'chess_level'
  ) THEN
    ALTER TABLE profiles ADD COLUMN chess_level TEXT DEFAULT 'beginner';
  END IF;
END $$;

-- game_chat table
CREATE TABLE IF NOT EXISTS game_chat (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id         UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE game_chat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players can read game chat" ON game_chat FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM games WHERE id = game_id AND (white_player = auth.uid() OR black_player = auth.uid()))
);
CREATE POLICY "Players can send game chat" ON game_chat FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM games WHERE id = game_id AND (white_player = auth.uid() OR black_player = auth.uid()))
);
CREATE INDEX IF NOT EXISTS idx_game_chat_game ON game_chat(game_id, created_at);
`;

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

    const parsed = new URL(dbUrl);
    const password = parsed.password;
    const projectRef = parsed.username.replace("postgres.", "");

    // Try ALL Supabase pooler regions + direct connection
    const regions = [
      "aws-0-eu-central-1",
      "aws-0-us-east-1",
      "aws-0-us-west-1",
      "aws-0-ap-southeast-1",
      "aws-0-ap-northeast-1",
      "aws-0-ap-south-1",
      "aws-0-sa-east-1",
      "aws-0-eu-west-1",
      "aws-0-eu-west-2",
      "aws-0-ap-southeast-2",
      "aws-0-ap-northeast-2",
      "aws-0-ca-central-1",
    ];

    const connections: { name: string; url: string }[] = [];

    // Direct connection (try both formats)
    connections.push({
      name: "direct-supabase-co",
      url: `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`,
    });

    // All pooler regions (both ports)
    for (const region of regions) {
      connections.push({
        name: `pooler-${region}-6543`,
        url: `postgresql://postgres.${projectRef}:${password}@${region}.pooler.supabase.com:6543/postgres`,
      });
      connections.push({
        name: `pooler-${region}-5432`,
        url: `postgresql://postgres.${projectRef}:${password}@${region}.pooler.supabase.com:5432/postgres?pgbouncer=true`,
      });
    }

    const { Client } = await import("pg");
    const errors: string[] = [];

    for (const conn of connections) {
      try {
        const client = new Client({
          connectionString: conn.url,
          connectionTimeoutMillis: 5000,
        });
        await client.connect();
        await client.query(MIGRATION_SQL);

        const res = await client.query(
          "SELECT tablename FROM pg_tables WHERE schemaname='public' AND (tablename LIKE 'battle%' OR tablename = 'withdrawals' OR tablename = 'game_chat')"
        );
        await client.end();

        return NextResponse.json({
          success: true,
          connection: conn.name,
          tables: res.rows.map((r: { tablename: string }) => r.tablename),
        });
      } catch (err: any) {
        // Only log non-timeout errors to avoid noise
        if (!err.message.includes("timeout") && !err.message.includes("ENOTFOUND")) {
          errors.push(`${conn.name}: ${err.message}`);
        } else if (err.message.includes("ENOTFOUND") === false) {
          errors.push(`${conn.name}: ${err.message}`);
        }
      }
    }

    return NextResponse.json({
      error: "All connection attempts failed",
      errors: errors.slice(0, 10),
      totalAttempts: connections.length,
      projectRef,
      passwordLength: password?.length || 0,
    }, { status: 500 });
  } catch (e: any) {
    console.error("Migration error:", e);
    return NextResponse.json({ error: e.message || "Migration failed" }, { status: 500 });
  }
}
