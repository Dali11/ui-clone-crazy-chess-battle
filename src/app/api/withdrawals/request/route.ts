import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";
import { moneySymbol, currencyCodeForCountry } from "@/lib/geo/format";
import { formatMoneyConverted } from "@/lib/geo/server-format";
import { getMwkToLocalRate } from "@/lib/geo/fx";
import { toPawaPayMsisdn, toPaychanguMobile } from "@/lib/geo/iso3";
import { detectPawaPayCorrespondent, PAWAPAY_CORRESPONDENT_NAMES } from "@/lib/payments/pawapay-operators";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const reqBody = await req.json();
    const { amount, payment_provider, currency, country } = reqBody;
    let phone = reqBody.phone;
    let operatorRefId = reqBody.operatorRefId;
    let operatorName = reqBody.operatorName;

    // ─── Load platform config ──────────────────────────────────────────
    const admin = createAdminClient();

    // Integrity hold: an OPEN anti-cheat flag freezes withdrawals until an
    // admin resolves it (Admin → Integrity). Message is deliberately
    // neutral — never accuse, just pause.
    const { count: openFlag } = await admin
      .from("integrity_flags")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "open");
    if ((openFlag ?? 0) > 0) {
      return NextResponse.json(
        { error: "Your account is under a routine review, so withdrawals are temporarily paused. This usually resolves within 24 hours — we'll email you as soon as it's complete." },
        { status: 403 },
      );
    }

    const wConfig = await getPlatformConfig(admin, "withdrawals");

    // Get user's currency symbol
    const { data: _profile } = await admin.from("profiles").select("country").eq("id", user.id).single();
    const sym = moneySymbol(_profile?.country);

    // ─── Local-currency wallet ──────────────────────────────────────
    // The amount the player typed (and every fee/net figure stored on
    // the withdrawal) is in THEIR wallet currency. Config limits stay
    // MWK and are converted here for validation.
    const walletCurrency = currencyCodeForCountry(_profile?.country);
    const mwkRate = walletCurrency === "MWK" ? 1 : await getMwkToLocalRate(admin, walletCurrency);
    if (walletCurrency !== "MWK" && !mwkRate) {
      return NextResponse.json({ error: "Currency conversion unavailable — try again shortly." }, { status: 503 });
    }
    const toLocal = (mk: number) => Math.round(mk * mwkRate);

    // Check if withdrawals are enabled
    if (!wConfig.enabled) {
      return NextResponse.json({ error: "Withdrawals are currently disabled" }, { status: 403 });
    }

    // Enforce minimum amount
    const minAmount = wConfig.min_amount || 10_000;
    const minLocal = toLocal(minAmount);
    if (!amount || amount < minLocal) {
      const minDisplay = minAmount.toLocaleString();
      return NextResponse.json({ error: `Minimum withdrawal is ${await formatMoneyConverted(minAmount, _profile?.country)}` }, { status: 400 });
    }

    // Enforce maximum amount
    const maxAmount = wConfig.max_amount || 500_000;
    const maxLocal = toLocal(maxAmount);
    if (amount > maxLocal) {
      const maxDisplay = maxAmount.toLocaleString();
      return NextResponse.json({ error: `Maximum withdrawal is ${await formatMoneyConverted(maxAmount, _profile?.country)}` }, { status: 400 });
    }

    // Enforce daily limit
    const dailyLimit = wConfig.daily_limit || 0;
    if (dailyLimit > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: todayWithdrawals } = await admin
        .from("withdrawals")
        .select("amount")
        .eq("user_id", user.id)
        .gte("created_at", today.toISOString())
        .in("status", ["pending", "approved", "completed"]);

      const limitLocal = toLocal(dailyLimit);
      const todayTotal = (todayWithdrawals || []).reduce((sum, w) => sum + w.amount, 0);
      if (todayTotal + amount > limitLocal) {
        const remaining = Math.max(0, limitLocal - todayTotal).toLocaleString();
        return NextResponse.json({ error: `Daily withdrawal limit reached. Remaining: ${remaining}` }, { status: 400 });
      }
    }

    // Validate phone format
    if (!phone || !operatorRefId || !operatorName) {
      return NextResponse.json({ error: "Phone, operator required" }, { status: 400 });
    }
    const isMalawi = !country || country === "MW";
    const phoneDigits = phone.replace(/\D/g, "");
    if (isMalawi) {
      const localPhone = phoneDigits.startsWith("265") ? "0" + phoneDigits.slice(3) : phoneDigits;
      if (localPhone.length < 9 || !localPhone.match(/^0[89]/)) {
        return NextResponse.json({ error: "Invalid Malawi mobile money number" }, { status: 400 });
      }
      // Store the CANONICAL local MSISDN (09...). Players paste "+265 986 57
      // 23 21" etc.; the raw form used to be stored and PayChangu's payouts
      // API rejects non-local formats instantly (live incident 2026-09-17/18:
      // every such withdrawal auto-refunded as "rejected").
      phone = localPhone;
    } else {
      // International: just require at least 8 digits
      if (phoneDigits.length < 8) {
        return NextResponse.json({ error: "Invalid mobile money number" }, { status: 400 });
      }
    }

    // Check for existing pending withdrawal (prevent spam)
    const { data: existingPending } = await admin
      .from("withdrawals")
      .select("id, amount")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .limit(1);

    if (existingPending && existingPending.length > 0) {
      return NextResponse.json({ error: "You already have a pending withdrawal. Wait for it to be processed before requesting another." }, { status: 400 });
    }

    // Apply withdrawal fee + processing fee
    const withdrawalFee = toLocal(wConfig.withdrawal_fee || 0);
    const processingFeePct = wConfig.processing_fee_pct || 0;
    // Exact percentage fee — no floor/ceil tricks. A 5% fee on ZMW 11 is
    // 0.55, and decimals are allowed (fee/net_amount columns are
    // numeric(14,2)). The fee can never silently default to 0.
    const processingFee = Math.round(amount * (processingFeePct / 100) * 100) / 100;
    const totalFees = withdrawalFee + processingFee;
    const netAmount = amount - totalFees;

    // Call the atomic request_withdrawal RPC (debits wallet)
    // Determine payment provider
    const provider = payment_provider || (isMalawi ? "paychangu" : "pawapay");

    // PawaPay operator auto-detection: payouts to a mismatched network fail
    // with PAYER_NOT_FOUND exactly like deposits (live incident 2026-09-17:
    // MTN Zambia number routed as ZAMTEL_ZMB). Unknown prefixes keep the
    // player's manual selection.
    if (provider === "pawapay") {
      const detectedCorrespondent = detectPawaPayCorrespondent(country, phone);
      if (detectedCorrespondent && detectedCorrespondent !== operatorRefId) {
        console.warn(
          `[pawapay-withdrawal] operator mismatch: requested ${operatorRefId}, MSISDN maps to ${detectedCorrespondent} — using detected`
        );
        operatorRefId = detectedCorrespondent;
        operatorName = PAWAPAY_CORRESPONDENT_NAMES[detectedCorrespondent] || operatorName;
      }
    }

    const { data: withdrawalId, error } = await admin.rpc("request_withdrawal", {
      p_user_id: user.id,
      p_amount: amount,
      p_phone: phone,
      p_operator_ref_id: operatorRefId,
      p_operator_name: operatorName,
    });

    // Store payment provider, currency, and country on the withdrawal record
    await admin
      .from("withdrawals")
      .update({
        payment_provider: provider,
        country: country || null,
        currency: currency || "MWK",
      })
      .eq("id", withdrawalId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Record fee + net on the withdrawal record for transparency.
    // ALWAYS write them — net_amount must reflect the real payout even
    // when the fee is 0, so history never shows a bogus "you receive 0".
    await admin
      .from("withdrawals")
      .update({
        fee: totalFees,
        net_amount: netAmount,
      })
      .eq("id", withdrawalId);

    // Check if auto-approve is enabled (from platform_settings, also synced to withdrawal_config)
    if (wConfig.auto_approve) {
      try {
        const { data: withdrawal, error: claimError } = await admin
          .from("withdrawals")
          .update({ status: "approved", processed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", withdrawalId)
          .eq("status", "pending")
          .select("*")
          .single();

        if (claimError || !withdrawal) {
          return NextResponse.json({ withdrawalId, status: "pending" });
        }

        // Initiate payout (PayChangu by default, PawaPay if specified)
        const chargeId = `wd_${withdrawal.id.slice(0, 8)}_${Date.now()}`;
        const amountMWK = (netAmount || withdrawal.amount);
        let payoutSucceeded = false;
        let payoutFailureReason: string | null = null;
        const payoutProvider = withdrawal.payment_provider || "paychangu";
        // Wallet amounts are ALREADY in the player's local currency —
        // pay out exactly the net that was debited. No conversion.
        const payoutCurrency = String(withdrawal.currency || "MWK").toUpperCase();

        if (payoutProvider === "pawapay") {
          try {
            const { initiatePayout } = await import("@/lib/payments/pawapay");
            const { randomUUID } = await import("crypto");
            const payoutId = randomUUID();
            // PawaPay expects a bare-digit MSISDN (no leading "+") — the
            // deposit flow already normalizes via toPawaPayMsisdn, but this
            // payout call was sending the raw "+2547..." phone straight
            // through, which PawaPay rejects every time.
            const payoutResponse = await initiatePayout({
              payoutId,
              amount: String(amountMWK),
              currency: payoutCurrency,
              phoneNumber: toPawaPayMsisdn(withdrawal.phone, withdrawal.country),
              provider: withdrawal.operator_ref_id,
            });

            if (payoutResponse.status === "ACCEPTED" || payoutResponse.status === "COMPLETED") {
              payoutSucceeded = true;
              await admin
                .from("withdrawals")
                .update({ status: "completed", charge_id: chargeId, pawapay_ref: payoutId, updated_at: new Date().toISOString() })
                .eq("id", withdrawalId);

              try {
                await admin.from("notifications").insert({
                  user_id: withdrawal.user_id,
                  type: "withdrawal_approved",
                  title: "Your withdrawal has been processed",
                  body: `${amountMWK.toLocaleString()}${payoutCurrency !== "MWK" ? ` ${payoutCurrency}` : ""} has been sent to ${withdrawal.phone} via ${withdrawal.operator_name}.`,
                  data: { amount: amountMWK, phone: withdrawal.phone, operator: withdrawal.operator_name, auto: true, fees: totalFees, provider: "pawapay" },
                  read: false,
                });
              } catch {}
            }
          } catch (payoutErr: any) {
            console.error("Auto-approve PawaPay payout error:", payoutErr);
            payoutFailureReason = String(payoutErr?.message || payoutErr).slice(0, 200);
          }
        } else {
          try {
            const payoutResponse = await fetch("https://api.paychangu.com/mobile-money/payouts/initialize", {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                // Legacy rows may hold "+265 986 57 23 21" style numbers —
                // normalize to the local MSISDN PayChangu requires.
                mobile: toPaychanguMobile(withdrawal.phone, withdrawal.country),
                mobile_money_operator_ref_id: withdrawal.operator_ref_id,
                amount: String(amountMWK),
                charge_id: chargeId,
              }),
            });

            const payoutData = await payoutResponse.json();
            if (payoutData && (payoutData.message || payoutData.error)) {
              payoutFailureReason = String(payoutData.message || payoutData.error).slice(0, 200);
            }

            if (payoutData.status === "success" || payoutData.status === "pending") {
              payoutSucceeded = true;
              await admin
                .from("withdrawals")
                .update({ status: "completed", charge_id: chargeId, updated_at: new Date().toISOString() })
                .eq("id", withdrawalId);

              try {
                await admin.from("notifications").insert({
                  user_id: withdrawal.user_id,
                  type: "withdrawal_approved",
                  title: "Your withdrawal has been processed",
                  body: `${await formatMoneyConverted(amountMWK, _profile?.country)} has been sent to ${withdrawal.phone} via ${withdrawal.operator_name}.`,
                  data: { amount: amountMWK, phone: withdrawal.phone, operator: withdrawal.operator_name, auto: true, fees: totalFees },
                  read: false,
                });
              } catch {}
            }
          } catch (payoutErr: any) {
            console.error("Auto-approve PayChangu payout error:", payoutErr);
            payoutFailureReason = String(payoutErr?.message || payoutErr).slice(0, 200);
          }
        }

        if (!payoutSucceeded) {
          await admin.rpc("refund_withdrawal", { p_withdrawal_id: withdrawalId, p_admin_id: null });
          // Keep the provider's failure message on the row — Command Centre
          // previously showed "rejected" with no reason, so systematic
          // phone-format rejections were invisible.
          if (payoutFailureReason) {
            try {
              await admin
                .from("withdrawals")
                .update({ rejection_reason: `Auto payout failed: ${payoutFailureReason}` })
                .eq("id", withdrawalId);
            } catch {}
          }
          try {
            await admin.from("notifications").insert({
              user_id: withdrawal.user_id,
              type: "withdrawal_failed",
              title: "Withdrawal payout failed",
              body: `Your withdrawal for ${await formatMoneyConverted(amountMWK, _profile?.country)} could not be processed. Funds returned to your wallet.`,
              data: { amount: amountMWK, auto: true },
              read: false,
            });
          } catch {}
          return NextResponse.json({ withdrawalId, status: "rejected", error: "Payout failed. Wallet has been refunded." });
        }

        try {
          await admin.from("admin_logs").insert({
            admin_id: null,
            action: "withdrawal_auto_approve",
            target_type: "withdrawal",
            target_id: withdrawalId,
            details: { amount: amountMWK, phone: withdrawal.phone, charge_id: chargeId, auto: true, fees: totalFees },
          });
        } catch {}

        return NextResponse.json({ withdrawalId, status: "completed", chargeId, auto: true });
      } catch (autoErr: any) {
        console.error("Auto-approve error:", autoErr);
        return NextResponse.json({ withdrawalId, status: "pending" });
      }
    }

    return NextResponse.json({ withdrawalId, status: "pending" });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to request withdrawal. Please try again." }, { status: 500 });
  }
}
