import { NextRequest, NextResponse } from "next/server";

// Migration: Lock gender changes at DB level once set, except for admin (service_role) updates
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

    // 1. Create trigger function that locks gender changes for regular users
    // auth.uid() returns null for service_role connections, so admin updates are allowed
    try {
      await client.query(`
        CREATE OR REPLACE FUNCTION lock_gender_once_set()
        RETURNS TRIGGER AS $$
        BEGIN
          -- Only block if a regular user is trying to change an already-set gender
          -- auth.uid() is null when using service_role key (admin)
          IF OLD.gender IS NOT NULL AND NEW.gender IS DISTINCT FROM OLD.gender THEN
            IF auth.uid() IS NOT NULL THEN
              RAISE EXCEPTION 'Gender is locked once set. Contact an admin to change it.'
                USING HINT = 'GENDER_LOCKED';
            END IF;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql SECURITY DEFINER
      `);
      results.push({ ok: true, sql: "Create lock_gender_once_set function" });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: "Create lock function" });
    }

    // 2. Create trigger on profiles
    try {
      await client.query(
        `DROP TRIGGER IF EXISTS trigger_lock_gender ON profiles`
      );
      await client.query(
        `CREATE TRIGGER trigger_lock_gender
         BEFORE UPDATE OF gender ON profiles
         FOR EACH ROW
         EXECUTE FUNCTION lock_gender_once_set()`
      );
      results.push({ ok: true, sql: "Create gender lock trigger" });
    } catch (e: any) {
      results.push({ ok: false, error: e.message, sql: "Create trigger" });
    }

    await client.end();

    const allOk = results.every((r: any) => r.ok);
    return NextResponse.json({ success: allOk, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
