import { NextRequest, NextResponse } from "next/server";
import { predictProvider } from "@/lib/payments/pawapay";

export async function POST(req: NextRequest) {
  try {
    const { phoneNumber } = await req.json();
    if (!phoneNumber) {
      return NextResponse.json({ error: "Phone number required" }, { status: 400 });
    }

    const result = await predictProvider(phoneNumber);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Failed to validate phone number" },
      { status: 400 }
    );
  }
}
