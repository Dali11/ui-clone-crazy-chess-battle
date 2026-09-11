import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";
import { ontechCollect, normalizeZmPhone, zmCarrier, zmCarrierName, zmwToMwk, isOntechConfigured } from "@/lib/payments/ontech";

/**
 * Zambia deposit via Ontech (Airtel Money / MTN MoMo / Zamtel Kwacha).
 * Player submits amount in ZMW + their ZM number; we collect via Ontech
 * (PIN prompt on their phone) and credit the wallet in MWK on confirmation.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles")
      .select("country, display_name, username, phone")
      .eq("id", user.id).single();
    if (profile?.country !== "ZM") {
      return NextResponse.json({ error: "Ontech deposits are for Zambia-based players only" }, { status: 403 });
    }

    if (!isOntechConfigured()) {
      return NextResponse.json({ error: "Payment gateway not configured" }, { status: 503 });
    }

    const { amount, phone: phoneArg } = await req.json(); // amount in ZMW
    if (!amount || typeof amount !== "number" || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }

    const zmConfig = await getPlatformConfig(admin, "payments_zm");
    if (!zmConfig.enabled) {
      return NextResponse.json({ error: "Deposits are currently unavailable in Zambia" }, { status: 403 });
    }
    if (amount < (zmConfig.min_deposit_zmw || 5)) {
      return NextResponse.json({ error: `Minimum deposit is K${zmConfig.min_deposit_zmw || 5}` }, { status: 400 });
    }
    if (amount > (zmConfig.max_withdrawal_zmw || 5000) && amount > (zmConfig.max_deposit_zmw || 5000)) {
      return NextResponse.json({ error: `Maximum deposit is K${zmConfig.max_deposit_zmw || 5000}` }, { status: 400 });
    }

    const zmPhone = normalizeZmPhone(phoneArg || profile?.phone || "");
    if (!zmPhone) {
      return NextResponse.json({ error: "Enter a valid Zambian mobile number (e.g. 0971234567)" }, { status: 400 });
    }
    const carrier = zmCarrier(zmPhone);
    if (!carrier) return NextResponse.json({ error: "Unsupported Zambian carrier" }, { status: 400 });

    // Live FX: MWK→ZMW. Wallet credits MWK; we record both amounts + rate.
    const { data: rateRow } = await admin.from("exchange_rates")
      .select("rate").eq("base_currency", "MWK").eq("target_currency", "ZMW").single();
    const rate = Number(rateRow?.rate || 0);
    if (!rate || rate <= 0) {
      return NextResponse.json({ error: "Currency conversion unavailable — try again shortly" }, { status: 503 });
    }
    const amountMwk = zmwToMwk(amount, rate);

    const reference = `ccbz${Date.now()}${user.id.slice(0, 6)}`;

    const { data: deposit, error: depositError } = await admin.from("deposits").insert({
      user_id: user.id,
      amount: amountMwk,              // MWK credited on success
      method: "ontech_mm",
      payment_provider: "ontech",
      status: "pending",
      charge_id: reference,
      phone: zmPhone,
      operator: carrier,
      country: "ZM",
      currency: "ZMW",
      amount_local: amount,
      fx_rate: rate,
    }).select("id").single();
    if (depositError || !deposit) {
      return NextResponse.json({ error: "Failed to create deposit record" }, { status: 500 });
    }

    const res = await ontechCollect({
      amount,
      phone: zmPhone,
      reference,
      description: `CCB wallet deposit ${reference}`,
      customerName: profile?.display_name || profile?.username || "CCB player",
    });

    await admin.from("deposits").update({
      tx_ref: res.transactionId,
      ontech_ref: res.transactionId,
      status: res.status === "failed" ? "failed" : "pending",
      updated_at: new Date().toISOString(),
    }).eq("id", deposit.id);

    if (!res.success) {
      return NextResponse.json({ error: res.message || "Deposit initiation failed — please try again" }, { status: 502 });
    }

    return NextResponse.json({
      depositId: deposit.id,
      chargeId: reference,
      status: res.status,          // sandbox: may be "success" already
      carrier: zmCarrierName(carrier),
      amountZmw: amount,
      amountMwk,
    });
  } catch {
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
