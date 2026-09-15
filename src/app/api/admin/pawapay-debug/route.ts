import { NextRequest, NextResponse } from "next/server";
import { checkDepositStatus } from "@/lib/payments/pawapay";

/**
 * TEMPORARY debug endpoint to inspect a PawaPay deposit's real failure
 * reason using the live production key (which only exists in this
 * runtime's env, not accessible to the agent's sandbox). Protected by
 * CRON_SECRET. Delete after use.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { depositId } = await req.json();
  if (!depositId) return NextResponse.json({ error: "depositId required" }, { status: 400 });
  try {
    const result = await checkDepositStatus(depositId);
    return NextResponse.json({ result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
