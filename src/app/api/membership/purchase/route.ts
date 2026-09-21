import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";
import { getExchangeRate, getMwkToLocalRate } from "@/lib/geo/fx";
import { currencyCodeForCountry } from "@/lib/geo/format";
import { initiateDeposit } from "@/lib/payments/pawapay";
import { toPawaPayMsisdn } from "@/lib/geo/iso3";
import { isAllowedDepositPhone } from "@/lib/deposit-phones";
import { randomUUID } from "crypto";

/**
 * POST /api/membership/purchase
 *
 * Buys/extends membership for players in EVERY country:
 *   - MW  -> PayChangu mobile-money rails (phone + operator -> PIN prompt)
 *   - Intl-> PawaPay rails (provider + phone -> PIN prompt), charged in the
 *           player's OWN currency at the live USD rate.
 *
 * Both create a deposits row with method='membership_purchase'. On payment
 * success the verify/webhook handlers extend profiles.membership_until
 * (NOT the wallet - the cash is platform revenue, swept weekly to the owner).
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { phone, operatorRefId, email, firstName, lastName,
            // PawaPay (international) fields:
            phoneNumber, provider } = body;

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("country, email, username, deposit_phone_numbers")
      .eq("id", user.id)
      .single();

    const cfg = await getPlatformConfig(admin, "membership");
    if (!cfg.enabled) {
      return NextResponse.json({ error: "Membership purchases are currently disabled" }, { status: 403 });
    }

    // USD $10/month pricing (owner decision 2026-09-15). Sanity-banded - if
    // both the live fetch and the DB-cached inverse rate look wrong, refuse
    // the purchase rather than charge the wrong amount.
    const priceUsd = Number(cfg.price_usd) || 10;
    let usdToMwk = await getExchangeRate("USD", "MWK");
    if (!usdToMwk || usdToMwk === 1) {
      const { data: dbRate } = await admin
        .from("exchange_rates")
        .select("rate")
        .eq("base_currency", "MWK")
        .eq("target_currency", "USD")
        .single();
      const inv = dbRate?.rate ? 1 / Number(dbRate.rate) : 0;
      if (inv > 0) usdToMwk = inv;
    }
    if (usdToMwk < 500 || usdToMwk > 5000) {
      return NextResponse.json({ error: "Pricing is temporarily unavailable - please try again in a moment." }, { status: 503 });
    }
    const amountMwk = Math.round(priceUsd * usdToMwk);
    if (amountMwk < 100) return NextResponse.json({ error: "Invalid membership price configured" }, { status: 500 });

    const isMalawi = !profile?.country || profile.country === "MW";

    // -- INTERNATIONAL: PawaPay rails, charged in the player's currency --
    if (!isMalawi) {
      if (!phoneNumber || !provider) {
        return NextResponse.json({ error: "Phone number and mobile money provider required" }, { status: 400 });
      }

      const currencyCode = currencyCodeForCountry(profile?.country);
      const mwkRate = await getMwkToLocalRate(admin, currencyCode); // 1 MWK -> local
      if (!mwkRate) {
        return NextResponse.json({ error: "Pricing is temporarily unavailable - please try again in a moment." }, { status: 503 });
      }
      const localAmount = Math.round(amountMwk * mwkRate);
      if (localAmount < 100) {
        return NextResponse.json({ error: "Invalid membership price configured" }, { status: 500 });
      }

      // Anti-fraud: PawaPay charges only go to a saved deposit phone the
      // player saved in Settings (same rule as wallet deposits).
      const savedPhones = (profile?.deposit_phone_numbers as string[] | null) || [];
      if (savedPhones.length === 0) {
        return NextResponse.json({ error: "Add a deposit phone number in Settings first." }, { status: 400 });
      }
      if (!isAllowedDepositPhone(savedPhones, phoneNumber)) {
        return NextResponse.json({ error: "Use one of your saved deposit phone numbers from Settings." }, { status: 400 });
      }

      const depositId = randomUUID();
      const chargeId = `pwp_${depositId.slice(0, 13)}`;

      const { data: deposit, error: depositError } = await admin
        .from("deposits")
        .insert({
          user_id: user.id,
          amount: amountMwk,
          method: "membership_purchase",
          payment_provider: "pawapay",
          status: "pending",
          charge_id: chargeId,
          phone: phoneNumber,
          operator: provider,
          pawapay_ref: depositId,
          country: profile?.country || null,
          currency: currencyCode,
          amount_local: localAmount,
          fx_rate: mwkRate,
        })
        .select("id")
        .single();

      if (depositError || !deposit) {
        return NextResponse.json({ error: "Failed to create purchase record" }, { status: 500 });
      }

      const msisdn = toPawaPayMsisdn(phoneNumber, profile?.country);
      try {
        const response = await initiateDeposit({
          depositId,
          amount: String(localAmount),
          currency: currencyCode,
          phoneNumber: msisdn,
          provider,
        });

        if (response.status === "ACCEPTED" || response.status === "COMPLETED") {
          return NextResponse.json({
            depositId: deposit.id,
            chargeId,
            status: "pending",
            message: "Check your phone to authorize the payment",
          });
        } else {
          await admin.from("deposits")
            .update({ status: "failed", updated_at: new Date().toISOString() })
            .eq("id", deposit.id);
          return NextResponse.json({ error: "Payment was not accepted. Please try again." }, { status: 400 });
        }
      } catch {
        await admin.from("deposits")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", deposit.id);
        return NextResponse.json({ error: "Unable to initiate payment. Please try again later." }, { status: 400 });
      }
    }

    // -- MALAWI: PayChangu mobile-money rails (unchanged) -----------------
    if (!phone || !operatorRefId) {
      return NextResponse.json({ error: "Phone number and operator required" }, { status: 400 });
    }

    const chargeId = `ccb_mem_${Date.now()}_${user.id.slice(0, 8)}`;

    const { data: deposit, error: depositError } = await admin
      .from("deposits")
      .insert({
        user_id: user.id,
        amount: amountMwk,
        method: "membership_purchase",
        status: "pending",
        charge_id: chargeId,
        phone,
        operator: operatorRefId,
      })
      .select("id")
      .single();

    if (depositError || !deposit) {
      return NextResponse.json({ error: "Failed to create purchase record" }, { status: 500 });
    }

    const res = await fetch("https://api.paychangu.com/mobile-money/payments/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mobile: phone,
        mobile_money_operator_ref_id: operatorRefId,
        amount: amountMwk,
        charge_id: chargeId,
        email: email || profile?.email || undefined,
        first_name: firstName || profile?.username || undefined,
        last_name: lastName || undefined,
      }),
    });

    const data = await res.json();

    if (!res.ok || data.error || data.status === "failed") {
      await admin.from("deposits")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", deposit.id);
      const safeError = data.status === "failed"
        ? "Payment request failed. Please check your phone number and try again."
        : "Unable to initiate payment. Please try again later.";
      return NextResponse.json({ error: safeError }, { status: 400 });
    }

    if (data.reference || data.tx_ref) {
      await admin.from("deposits")
        .update({ paychangu_ref: data.reference || data.tx_ref })
        .eq("id", deposit.id);
    }

    return NextResponse.json({
      depositId: deposit.id,
      chargeId,
      amount: amountMwk,
      status: data.status || "pending",
      message: data.message || "Check your phone to authorize the payment",
    });
  } catch {
    return NextResponse.json({ error: "Server error. Please try again." }, { status: 500 });
  }
}
