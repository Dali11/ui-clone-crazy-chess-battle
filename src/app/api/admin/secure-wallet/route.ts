import { NextRequest, NextResponse } from "next/server";

/**
 * Security migration: hardens wallet SQL functions and adds DB-level constraints.
 * Direct DATABASE_URL connection pattern (pg Client).
 * Protected by CRON_SECRET. Idempotent.
 */

const MIGRATION_SQL = `
-- 1. credit_wallet — hardened + FX-aware (matches migration 080).
-- Takes a MWK amount, credits the player's wallet in THEIR OWN currency
-- (round(amount * mwk_rate(user))). MWK wallets skip conversion (rate = 1).
-- Raises if user not found; validates amount.
-- DO NOT deploy a raw 'wallet_balance + p_amount' version here: wallets
-- are LOCAL-currency since migration 080 — raw MWK numerals would
-- corrupt every non-Malawi player's balance by the FX factor (~75x).
CREATE OR REPLACE FUNCTION public.credit_wallet(p_user_id UUID, p_amount INT)
RETURNS VOID AS $$
DECLARE
  v_rate NUMERIC;
  v_local INT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'credit_wallet: amount must be positive, got %', p_amount;
  END IF;
  v_rate := public.mwk_rate(p_user_id);
  IF v_rate < 0 THEN
    RAISE EXCEPTION 'credit_wallet: FX rate unavailable for this wallet currency';
  END IF;
  v_local := round(p_amount * v_rate)::INT;
  UPDATE profiles
  SET wallet_balance = wallet_balance + v_local, updated_at = now()
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit_wallet: user % not found', p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. debit_wallet — single atomic UPDATE with WHERE clause (eliminates
-- TOCTOU race). Same FX conversion as credit_wallet so refunds return
-- exactly what was charged while the rate is unchanged.
CREATE OR REPLACE FUNCTION public.debit_wallet(p_user_id UUID, p_amount INT)
RETURNS VOID AS $$
DECLARE
  v_rate NUMERIC;
  v_local INT;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'debit_wallet: amount must be positive, got %', p_amount;
  END IF;
  v_rate := public.mwk_rate(p_user_id);
  IF v_rate < 0 THEN
    RAISE EXCEPTION 'debit_wallet: FX rate unavailable for this wallet currency';
  END IF;
  v_local := round(p_amount * v_rate)::INT;
  UPDATE profiles SET wallet_balance = wallet_balance - v_local, updated_at = now()
  WHERE id = p_user_id AND wallet_balance >= v_local;
  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id) THEN
      RAISE EXCEPTION 'debit_wallet: user % not found', p_user_id;
    END IF;
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.credit_wallet(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.debit_wallet(UUID, INT) TO authenticated;

-- 3. Partial unique index on deposits.reference — DB-level backstop against
--    double-pays, scoped to exactly-once money flows. A global unique index is
--    WRONG here: repeatable flows legitimately reuse references (queue joins
--    per user+stake, tournament entries per tournament, draw refunds per game
--    shared by both players before the draw:white/draw:black split).
--    Scoped patterns: league payouts, queue refunds/timeouts, stuck-battle
--    cancels/heals, draw refunds (post-split), expired/cleaned challenges.
CREATE UNIQUE INDEX IF NOT EXISTS deposits_reference_unique
  ON deposits (reference)
  WHERE reference LIKE 'league:%'
     OR reference LIKE 'battle_queue_refund:%'
     OR reference LIKE 'battle_queue_timeout:%'
     OR reference LIKE 'battle_cancel:%'
     OR reference LIKE 'heal_stuck:%'
     OR reference LIKE 'battle:%:draw:%'
     OR reference LIKE 'expired_challenge:%'
     OR reference LIKE 'cleanup_expired:%';

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
