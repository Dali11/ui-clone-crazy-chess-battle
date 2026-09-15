import { NextRequest, NextResponse } from "next/server";
import { getActiveConfig } from "@/lib/payments/pawapay";
import { toAlpha3 } from "@/lib/geo/iso3";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    // profile.country is alpha-2 (e.g. "KE") — PawaPay expects alpha-3 (e.g. "KEN")
    const rawCountry = searchParams.get("country") || undefined;
    const country = rawCountry ? toAlpha3(rawCountry) : undefined;
    const operationType = searchParams.get("operationType") as "DEPOSIT" | "PAYOUT" | undefined;

    const config = await getActiveConfig(country, operationType);
    return NextResponse.json(config);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to load PawaPay configuration" },
      { status: 500 }
    );
  }
}
