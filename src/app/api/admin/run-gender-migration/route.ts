import { NextRequest, NextResponse } from "next/server";

/**
 * ONE-TIME migration runner (2026-09-28) — applies migrations/gender-lock.sql,
 * which was committed (8aff226) but never actually executed against
 * production. Missing `profiles.gender_verified_at` was causing every
 * /api/admin/identity-verification request to 42703/500 — the admin
 * Verification tab silently showed "No players found" for ALL filters
 * because the frontend swallows API errors into an empty list.
 *
 * Protected by CRON_SECRET (same secret already used by db-debug). Delete
 * this route immediately after running once — it exists only to reach the
 * DB over the container's network, which the sandbox cannot do directly.
 */
export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return NextResponse.json({ error: "DATABASE_URL not set" }, { status: 500 });

    const { Client } = await import("pg");
    const client = new Client({ connectionString: dbUrl });
    await client.connect();

    const sql = `
      ALTER TABLE profiles ADD COLUMN IF NOT EXISTS gender_verified_at TIMESTAMPTZ;

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
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trigger_reset_identity_on_gender_change ON profiles;
      CREATE TRIGGER trigger_reset_identity_on_gender_change
        BEFORE UPDATE OF gender ON profiles
        FOR EACH ROW
        EXECUTE FUNCTION reset_identity_on_gender_change();

      CREATE OR REPLACE FUNCTION lock_gender_once_set()
      RETURNS TRIGGER AS $$
      BEGIN
        IF OLD.gender IS NOT NULL AND NEW.gender IS DISTINCT FROM OLD.gender THEN
          IF auth.uid() IS NOT NULL THEN
            RAISE EXCEPTION 'Gender is locked once set. Contact an admin to change it.'
              USING HINT = 'GENDER_LOCKED';
          END IF;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql SECURITY DEFINER;

      DROP TRIGGER IF EXISTS trigger_lock_gender ON profiles;
      CREATE TRIGGER trigger_lock_gender
        BEFORE UPDATE OF gender ON profiles
        FOR EACH ROW
        EXECUTE FUNCTION lock_gender_once_set();

      UPDATE profiles
      SET gender_verified_at = COALESCE(identity_verified_at, updated_at, NOW())
      WHERE identity_verified = true AND gender IS NOT NULL AND gender_verified_at IS NULL;
    `;

    await client.query(sql);

    const check = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='profiles' AND column_name='gender_verified_at'"
    );
    const triggers = await client.query(
      "SELECT tgname FROM pg_trigger WHERE tgrelid = 'profiles'::regclass AND NOT tgisinternal"
    );
    await client.end();

    return NextResponse.json({
      success: true,
      columnAdded: check.rows.length > 0,
      triggers: triggers.rows.map((r: any) => r.tgname),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: 500 });
  }
}
