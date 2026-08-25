import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Supabase env vars not set" }, { status: 500 });
    }

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

    const results: { ok: boolean; sql: string; error?: string }[] = [];

    for (const sql of statements) {
      try {
        // Use Supabase REST API to execute raw SQL via the pg_meta endpoint
        const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: "POST",
          headers: {
            "apikey": serviceKey,
            "Authorization": `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sql }),
        });
        if (!res.ok) {
          const errText = await res.text();
          results.push({ ok: false, sql: sql.substring(0, 90), error: errText.substring(0, 200) });
        } else {
          results.push({ ok: true, sql: sql.substring(0, 90) });
        }
      } catch (e: any) {
        results.push({ ok: false, sql: sql.substring(0, 90), error: e.message });
      }
    }

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
