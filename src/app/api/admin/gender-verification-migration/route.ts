import { NextRequest, NextResponse } from "next/server";

// One-time migration: Add gender_verified_at column + trigger to reset identity_verified when gender changes
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

    // 1. Add gender_verified_at column
    try {
      await client.query(
        `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender_verified_at TIMESTAMPTZ`
      );
      results.push({ ok: true, sql: "Add gender_verified_at column" });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: "Add gender_verified_at column" });
    }

    // 2. Create trigger function: when gender changes, reset identity_verified
    try {
      await client.query(`
        CREATE OR REPLACE FUNCTION reset_identity_on_gender_change()
        RETURNS TRIGGER AS $$
        BEGIN
          IF NEW.gender IS DISTINCT FROM OLD.gender THEN
            NEW.identity_verified := FALSE;
            NEW.identity_verified_at := NULL;
            NEW.gender_verified_at := NULL;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
      `);
      results.push({ ok: true, sql: "Create reset_identity_on_gender_change function" });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: "Create reset function" });
    }

    // 3. Create trigger on profiles
    try {
      await client.query(
        `DROP TRIGGER IF EXISTS trigger_reset_identity_on_gender_change ON profiles`
      );
      await client.query(
        `CREATE TRIGGER trigger_reset_identity_on_gender_change
         BEFORE UPDATE OF gender ON profiles
         FOR EACH ROW
         EXECUTE FUNCTION reset_identity_on_gender_change()`
      );
      results.push({ ok: true, sql: "Create gender change trigger" });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: "Create trigger" });
    }

    // 4. Backfill: set gender_verified_at for already identity_verified profiles
    try {
      const { rowCount } = await client.query(
        `UPDATE profiles
         SET gender_verified_at = COALESCE(identity_verified_at, updated_at, NOW())
         WHERE identity_verified = true AND gender IS NOT NULL AND gender_verified_at IS NULL`
      );
      results.push({ ok: true, sql: `Backfilled gender_verified_at for ${rowCount || 0} profiles` });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: "Backfill gender_verified_at" });
    }

    await client.end();

    const allOk = results.every((r: any) => r.ok);
    return NextResponse.json({ success: allOk, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
