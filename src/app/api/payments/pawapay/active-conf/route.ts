import { NextRequest, NextResponse } from "next/server";
import { getActiveConfig } from "@/lib/payments/pawapay";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const country = searchParams.get("country") || undefined;
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
