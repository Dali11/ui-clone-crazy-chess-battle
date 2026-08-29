import { NextRequest, NextResponse } from "next/server";

/**
 * Security migration: hardens the wallet SQL functions and adds DB-level
 * constraints to prevent double-credits, double-debits, and duplicate refunds.
 *
 * 1. credit_wallet: now returns INT (rows affected) and RAISES if user not found
 * 2. debit_wallet: merges check+update into a single atomic UPDATE ... WHERE
 *    (eliminates the TOCTOU race where two concurrent debits both pass the
 *    SELECT check and both execute, driving the wallet negative)
 * 3. Partial unique index on deposits.reference — prevents duplicate audit
 *    entries at the DB level (the ultimate backstop against double-refunds)
 * 4. Unique constraint on daily_checkins (user_id, checkin_date) — prevents
 *    double check-in rewards from concurrent requests
 *
 * Protected by CRON_SECRET. Safe to run multiple times (uses CREATE OR REPLACE
 * and IF NOT EXISTS).
 */

const MIGRATION_SQL = `
-- ============================================================
-- 1. credit_wallet — now returns affected row count, raises if user missing
-- ============================================================
CREATE OR REPLACE FUNCTION public.credit_wallet(p_user_id UUID, p_amount INT)
RETURNS INT AS $$
DECLARE
  affected INT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'credit_wallet: amount must be positive, got %', p_amount;
  END IF;

  UPDATE profiles SET wallet_balance = wallet_balance + p_amount WHERE id = p_user_id;
  GET DIAGNOSTICS affected = ROW_COUNT;

  IF affected = 0 THEN
    RAISE EXCEPTION 'credit_wallet: user % not found', p_user_id;
  END IF;

  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. debit_wallet — single atomic UPDATE with WHERE clause
--    Eliminates the TOCTOU race: the check and the update are now ONE statement.
--    If the balance is insufficient, zero rows are updated and we raise.
--    Two concurrent debits can no longer both pass the check.
-- ============================================================
CREATE OR REPLACE FUNCTION public.debit_wallet(p_user_id UUID, p_amount INT)
RETURNS INT AS $$
DECLARE
  affected INT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'debit_wallet: amount must be positive, got %', p_amount;
  END IF;

  UPDATE profiles
  SET wallet_balance = wallet_balance - p_amount
  WHERE id = p_user_id AND wallet_balance >= p_amount;

  GET DIAGNOSTICS affected = ROW_COUNT;

  IF affected = 0 THEN
    PERFORM 1 FROM profiles WHERE id = p_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'debit_wallet: user % not found', p_user_id;
    END IF;
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  RETURN affected;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-grant (CREATE OR REPLACE drops grants in some PG versions)
GRANT EXECUTE ON FUNCTION public.credit_wallet(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debit_wallet(UUID, INT) TO authenticated;

-- ============================================================
-- 3. Partial unique index on deposits.reference
--    The ultimate backstop: even if application-level atomic claims fail,
--    the DB itself will reject a duplicate reference.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS deposits_reference_unique
  ON deposits (reference)
  WHERE reference IS NOT NULL;

-- ============================================================
-- 4. Unique constraint on daily_checkins (user_id, checkin_date)
--    Prevents double check-in from concurrent requests.
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS daily_checkins_user_date_unique
  ON daily_checkins (user_id, checkin_date);
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

    connections.push({
      name: "direct-supabase-co",
      url: `postgresql://postgres:${password}@db.${projectRef}.supabase.co:5432/postgres`,
    });

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

        const res = await client.query(`
          SELECT proname, prosrc
          FROM pg_proc
          WHERE proname IN ('credit_wallet', 'debit_wallet')
          ORDER BY proname;
        `);

        await client.end();

        return NextResponse.json({
          success: true,
          connection: conn.name,
          functions: res.rows.map((r: { proname: string; prosrc: string }) => ({
            name: r.proname,
            src: r.prosrc.slice(0, 200),
          })),
        });
      } catch (err: any) {
        if (!err.message.includes("timeout") && !err.message.includes("ENOTFOUND")) {
          errors.push(`${conn.name}: ${err.message}`);
        }
      }
    }

    return NextResponse.json({
      error: "All connection attempts failed",
      errors: errors.slice(0, 10),
      totalAttempts: connections.length,
    }, { status: 500 });
  } catch (e: any) {
    console.error("Wallet security migration error:", e);
    return NextResponse.json({ error: e.message || "Migration failed" }, { status: 500 });
  }
}
