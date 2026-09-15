import { NextRequest, NextResponse } from "next/server";
import { checkDepositStatus, pawapayBaseUrl, pawapayHeaders } from "@/lib/payments/pawapay";
import { randomUUID } from "crypto";

/**
 * TEMPORARY debug endpoint to inspect PawaPay deposit behavior using the
 * live production key (which only exists in this runtime's env, not
 * accessible to the agent's sandbox). Protected by CRON_SECRET. Delete
 * after use.
 *
 * POST { depositId } -> check status of an existing deposit
 * POST { test: true, amount, currency, phoneNumber, provider } -> fire a
 *   raw test deposit and return PawaPay's exact raw response body/status
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json();

  if (body.test) {
    const depositId = randomUUID();
    const res = await fetch(`${pawapayBaseUrl()}/deposits`, {
      method: "POST",
      headers: pawapayHeaders(),
      body: JSON.stringify({
        depositId,
        amount: String(body.amount),
        currency: body.currency,
        payer: {
          type: "MMO",
          accountDetails: {
            phoneNumber: body.phoneNumber,
            provider: body.provider,
          },
        },
      }),
    });
    const text = await res.text();
    return NextResponse.json({ httpStatus: res.status, depositId, rawBody: text });
  }

  if (!body.depositId) return NextResponse.json({ error: "depositId required" }, { status: 400 });
  try {
    const result = await checkDepositStatus(body.depositId);
    return NextResponse.json({ result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
