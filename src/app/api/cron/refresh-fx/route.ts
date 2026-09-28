import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * Daily FX rate refresh cron endpoint.
 * Fetches live MWK→* rates from the free open.er-api.com API and
 * caches them in the exchange_rates table.
 *
 * Schedule: once daily via Vercel Cron (vercel.json).
 * Can also be triggered manually by an admin.
 *
 * Authorization: CRON_SECRET header (set in Vercel env vars).
 */
export async function GET(req: NextRequest) {
  // Verify the cron secret
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Fetch all rates from MWK
    const res = await fetch("https://open.er-api.com/v6/latest/MWK", {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: "FX API unavailable" }, { status: 502 });
    }
    const data = await res.json();
    if (data.result !== "success" || !data.rates) {
      return NextResponse.json({ error: "FX API returned error" }, { status: 502 });
    }

    const admin = createAdminClient();
    const nowIso = new Date().toISOString();

    // All currencies we need to cache (matching COUNTRY_CURRENCY map + extras)
    const targets = [
      "USD", "GBP", "ZAR", "KES", "TZS", "ZMW", "ZWL", "MZN",
      "UGX", "RWF", "BWP", "NAD", "NGN", "GHS", "EGP", "MAD",
      "DZD", "TND", "ETB", "XOF", "XAF", "CDF", "AOA", "MGA",
      "MUR", "SCR", "SZL", "LSL", "CAD", "EUR", "CHF", "NOK",
      "SEK", "DKK", "AUD", "NZD", "CNY", "INR", "JPY", "BRL",
      "MXN",
    ];

    let updated = 0;
    const upserts: any[] = [];
    for (const target of targets) {
      if (data.rates[target] != null) {
        upserts.push({
          base_currency: "MWK",
          target_currency: target,
          rate: data.rates[target],
          fetched_at: nowIso,
        });
        updated++;
      }
    }

    if (upserts.length > 0) {
      const { error } = await admin
        .from("exchange_rates")
        .upsert(upserts, { onConflict: "base_currency,target_currency" });
      if (error) {
        console.error("FX rate cache update failed:", error);
        return NextResponse.json({ error: "Failed to cache rates" }, { status: 500 });
      }
    }

    return NextResponse.json({
      success: true,
      ratesUpdated: updated,
      baseCurrency: "MWK",
      fetchedAt: nowIso,
    });
  } catch (e: any) {
    console.error("FX refresh cron error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
