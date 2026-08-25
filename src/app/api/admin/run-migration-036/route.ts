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

    const statements = [
      `ALTER TABLE public.withdrawal_config ADD COLUMN IF NOT EXISTS min_withdrawal_cents INT NOT NULL DEFAULT 1000`,
      `ALTER TABLE public.withdrawal_config ADD COLUMN IF NOT EXISTS max_withdrawal_cents INT NOT NULL DEFAULT 5000000`,
      `ALTER TABLE public.withdrawal_config ADD COLUMN IF NOT EXISTS min_deposit_cents INT NOT NULL DEFAULT 500`,
      `ALTER TABLE public.withdrawal_config ADD COLUMN IF NOT EXISTS processing_fee_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00`,
      `ALTER TABLE public.withdrawal_config ADD COLUMN IF NOT EXISTS daily_withdrawal_limit_cents INT NOT NULL DEFAULT 1000000`,
      `ALTER TABLE public.withdrawal_config ADD COLUMN IF NOT EXISTS withdrawal_fee_cents INT NOT NULL DEFAULT 0`,
      `ALTER TABLE public.withdrawal_config ADD COLUMN IF NOT EXISTS deposit_fee_cents INT NOT NULL DEFAULT 0`,
      `ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS admin_notes TEXT`,
      `ALTER TABLE public.deposits ADD COLUMN IF NOT EXISTS credited_by UUID REFERENCES public.profiles(id)`,
      `ALTER TABLE public.withdrawals ADD COLUMN IF NOT EXISTS rejection_reason TEXT`,
    ];

    for (const sql of statements) {
      try {
        await client.query(sql);
        results.push({ ok: true, sql: sql.substring(0, 90) });
      } catch (e: any) {
        results.push({ ok: false, error: e.message, sql: sql.substring(0, 90) });
      }
    }

    await client.end();

    const failed = results.filter(r => !r.ok);
    return NextResponse.json({
      success: failed.length === 0,
      results,
      migration: "036_platform_finance_config",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
