import { NextRequest, NextResponse } from "next/server";

/**
 * Security migration: hardens wallet SQL functions and adds DB-level constraints.
 * Uses the same direct DATABASE_URL connection pattern as migrate-spectator-count.
 * Protected by CRON_SECRET. Idempotent.
 */

const MIGRATION_SQL = `
-- 1. credit_wallet — returns affected count, raises if user not found, validates amount
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

-- 2. debit_wallet — single atomic UPDATE with WHERE clause (eliminates TOCTOU race)
CREATE OR REPLACE FUNCTION public.debit_wallet(p_user_id UUID, p_amount INT)
RETURNS INT AS $$
DECLARE
  affected INT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'debit_wallet: amount must be positive, got %', p_amount;
  END IF;
  UPDATE profiles SET wallet_balance = wallet_balance - p_amount
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

GRANT EXECUTE ON FUNCTION public.credit_wallet(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debit_wallet(UUID, INT) TO authenticated;

-- 3. Partial unique index on deposits.reference — DB-level backstop against double-refunds
CREATE UNIQUE INDEX IF NOT EXISTS deposits_reference_unique
  ON deposits (reference) WHERE reference IS NOT NULL;

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

    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbUrl, connectionTimeoutMillis: 10000 });
    await client.connect();
    await client.query(MIGRATION_SQL);

    // Verify functions were updated
    const res = await client.query(`
      SELECT proname, prosrc
      FROM pg_proc
      WHERE proname IN ('credit_wallet', 'debit_wallet')
      ORDER BY proname;
    `);
    await client.end();

    return NextResponse.json({
      success: true,
      functions: res.rows.map((r: { proname: string; prosrc: string }) => ({
        name: r.proname,
        has_atomic_guard: r.prosrc.includes('GET DIAGNOSTICS'),
      })),
      constraints: [
        "deposits_reference_unique (partial, reference IS NOT NULL)",
      ],
    });
  } catch (e: any) {
    console.error("Wallet security migration error:", e);
    return NextResponse.json({
      error: e.message || "Migration failed",
      sql_to_run_manually: "Run in Supabase SQL Editor — see migration SQL in source",
    }, { status: 500 });
  }
}
