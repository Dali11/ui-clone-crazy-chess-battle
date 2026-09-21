import { NextResponse } from "next/server";

// TEMPORARY diagnostic — reports only whether each secret exists and its length.
export async function GET() {
  const keys = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "DATABASE_URL",
    "PAYCHANGU_SECRET_KEY",
    "PAYCHANGU_PUBLIC_KEY",
    "PAYCHANGU_WEBHOOK_SECRET",
    "PAWAPAY_API_KEY",
    "PAYMENT_GATEWAY_API_KEY",
    "PAYMENT_GATEWAY_WEBHOOK_SECRET",
    "RESEND_API_KEY",
    "VAPID_PRIVATE_KEY",
    "CRON_SECRET",
  ];
  const out: Record<string, number | null> = {};
  for (const k of keys) {
    const v = process.env[k];
    out[k] = v && v.length > 0 ? v.length : null;
  }
  return NextResponse.json(out);
}
