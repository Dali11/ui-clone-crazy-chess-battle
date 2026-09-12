import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getPlatformConfig } from "@/lib/platform-config";
import { moneySymbol } from "@/lib/geo/format";
import { formatMoneyConverted } from "@/lib/geo/server-format";
import { normalizeZmPhone, zmCarrier, zmCarrierName, zmwToMwk, isOntechConfigured } from "@/lib/payments/ontech";

/**
 * Zambia withdrawal request (Ontech). Body: amount in ZMW plus either
 *   { method: "mobile", phone } or { method: "bank", bankCode, accountNumber, recipientName }.
 * Wallet is debited in MWK at the live rate; fees/net are stored in ZMW
 * (fee + net_amount columns hold LOCAL currency for provider='ontech' rows);
 * payout executes on admin approval via the ontech disburse branch.
 */
async function requestZmWithdrawal(
  _req: NextRequest,
  userId: string,
  args: {
    amount: number;
    phone?: string;
    zmMethod?: string;
    bankCode?: string;
    accountNumber?: string;
    recipientName?: string;
  }
): Promise<NextResponse> {
  const admin = createAdminClient();

  const zmConfig = await getPlatformConfig(admin, "payments_zm");
  if (!zmConfig.enabled) {
    return NextResponse.json({ error: "Withdrawals are currently unavailable in Zambia" }, { status: 403 });
  }
  if (!isOntechConfigured()) {
    return NextResponse.json({ error: "Payment gateway not configured" }, { status: 503 });
  }

  const amountZmw = Number(args.amount);
  if (!amountZmw || amountZmw <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }
  if (amountZmw < (zmConfig.min_withdrawal_zmw || 10)) {
    return NextResponse.json({ error: `Minimum withdrawal is K${zmConfig.min_withdrawal_zmw || 10}` }, { status: 400 });
  }
  if (amountZmw > (zmConfig.max_withdrawal_zmw || 5000)) {
    return NextResponse.json({ error: `Maximum withdrawal is K${zmConfig.max_withdrawal_zmw || 5000}` }, { status: 400 });
  }

  // Method validation → bank_code / recipient / operator fields
  let bankCode: string;
  let accountNumber: string;
  let recipientName: string;
  let operatorName: string;
  if (args.zmMethod === "bank") {
    if (!args.bankCode || !args.accountNumber || !args.recipientName) {
      return NextResponse.json({ error: "Bank, account number and account name are required" }, { status: 400 });
    }
    bankCode = String(args.bankCode).toUpperCase();
    accountNumber = String(args.accountNumber).replace(/\s+/g, "");
    recipientName = String(args.recipientName).trim();
    operatorName = "Bank transfer";
  } else {
    const zmPhone = normalizeZmPhone(args.phone || "");
    const carrier = zmPhone ? zmCarrier(zmPhone) : null;
    if (!zmPhone || !carrier) {
      return NextResponse.json({ error: "Enter a valid Zambian mobile number (e.g. 0971234567)" }, { status: 400 });
    }
    bankCode = carrier;
    accountNumber = zmPhone;
    const { data: profileRow } = await admin.from("profiles").select("display_name, username").eq("id", userId).single();
    recipientName = String(args.recipientName || profileRow?.display_name || profileRow?.username || "CCB player").trim();
    operatorName = zmCarrierName(carrier);
  }

  // Existing pending withdrawal (same rule as MW)
  const { data: existingPending } = await admin.from("withdrawals")
    .select("id").eq("user_id", userId).eq("status", "pending").limit(1);
  if (existingPending && existingPending.length > 0) {
    return NextResponse.json({ error: "You already have a pending withdrawal. Wait for it to be processed before requesting another." }, { status: 400 });
  }

  // Live FX: convert ZMW → MWK (wallet debits MWK)
  const { data: rateRow } = await admin.from("exchange_rates")
    .select("rate").eq("base_currency", "MWK").eq("target_currency", "ZMW").single();
  const rate = Number(rateRow?.rate || 0);
  if (!rate || rate <= 0) {
    return NextResponse.json({ error: "Currency conversion unavailable — try again shortly" }, { status: 503 });
  }
  const amountMwk = zmwToMwk(amountZmw, rate);

  // Daily limit (MWK-denominated global cap still applies)
  const wConfig = await getPlatformConfig(admin, "withdrawals");
  const dailyLimit = wConfig.daily_limit || 0;
  if (dailyLimit > 0) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { data: todayWithdrawals } = await admin.from("withdrawals")
      .select("amount").eq("user_id", userId).gte("created_at", today.toISOString())
      .in("status", ["pending", "approved", "completed"]);
    const todayTotal = (todayWithdrawals || []).reduce((sum, w) => sum + w.amount, 0);
    if (todayTotal + amountMwk > dailyLimit) {
      return NextResponse.json({ error: "Daily withdrawal limit reached" }, { status: 400 });
    }
  }

  // Fees in ZMW (processing % only — the fixed fee is MWK-denominated)
  const pct = Number(wConfig.processing_fee_pct || 0);
  const feeZmw = Math.round(amountZmw * (pct / 100));
  const netZmw = Math.max(0, Math.round(amountZmw - feeZmw));

  // Atomic debit + insert (throws 'Insufficient balance')
  let withdrawalId: string;
  try {
    const { data: id, error } = await admin.rpc("request_withdrawal", {
      p_user_id: userId,
      p_amount: amountMwk,
      p_phone: accountNumber,
      p_operator_ref_id: bankCode,
      p_operator_name: operatorName,
    });
    if (error || !id) throw new Error(error?.message || "Withdrawal failed");
    withdrawalId = id;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Insufficient balance" }, { status: 400 });
  }

  await admin.from("withdrawals").update({
    payment_provider: "ontech",
    country: "ZM",
    currency: "ZMW",
    amount_local: amountZmw,
    fx_rate: rate,
    bank_code: bankCode,
    account_number: accountNumber,
    recipient_name: recipientName,
    fee: feeZmw || 0,
    net_amount: netZmw,
  }).eq("id", withdrawalId);

  try {
    await admin.from("notifications").insert({
      user_id: userId,
      type: "withdrawal_requested",
      title: "Withdrawal requested",
      body: `Your K${amountZmw} withdrawal request is being reviewed.`,
      data: { withdrawal_id: withdrawalId, currency: "ZMW", amount_local: amountZmw },
      read: false,
    });
  } catch {}

  return NextResponse.json({ withdrawalId, status: "pending", amountZmw, amountMwk });
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { amount, phone, operatorRefId, operatorName, payment_provider, currency, country,
            method: zmMethod, bankCode, accountNumber, recipientName } = await req.json();

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

    // Check if withdrawals are enabled
    if (!wConfig.enabled) {
      return NextResponse.json({ error: "Withdrawals are currently disabled" }, { status: 403 });
    }

    // ─── ZAMBIA (Ontech): amount in ZMW, payout mobile money or bank ────
    const isZm = _profile?.country === "ZM" || payment_provider === "ontech" || country === "ZM";
    if (isZm) {
      return await requestZmWithdrawal(req, user.id, { amount, phone, zmMethod, bankCode, accountNumber, recipientName });
    }

    // Enforce minimum amount
    const minAmount = wConfig.min_amount || 10_000;
    if (!amount || amount < minAmount) {
      const minDisplay = minAmount.toLocaleString();
      return NextResponse.json({ error: `Minimum withdrawal is ${await formatMoneyConverted(minAmount, _profile?.country)}` }, { status: 400 });
    }

    // Enforce maximum amount
    const maxAmount = wConfig.max_amount || 500_000;
    if (amount > maxAmount) {
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

      const todayTotal = (todayWithdrawals || []).reduce((sum, w) => sum + w.amount, 0);
      if (todayTotal + amount > dailyLimit) {
        const remaining = Math.max(0, dailyLimit - todayTotal).toLocaleString();
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
    const withdrawalFee = wConfig.withdrawal_fee || 0;
    const processingFeePct = wConfig.processing_fee_pct || 0;
    const processingFee = Math.floor(amount * (processingFeePct / 100));
    const totalFees = withdrawalFee + processingFee;
    const netAmount = amount - totalFees;

    // Call the atomic request_withdrawal RPC (debits wallet)
    // Determine payment provider
    const provider = payment_provider || (isMalawi ? "paychangu" : "pawapay");

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
      })
      .eq("id", withdrawalId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Record fees (store on the withdrawal record for transparency)
    if (totalFees > 0) {
      await admin
        .from("withdrawals")
        .update({
          fee: totalFees,
          net_amount: netAmount,
        })
        .eq("id", withdrawalId);
    }

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
        const payoutProvider = withdrawal.payment_provider || "paychangu";

        if (payoutProvider === "pawapay") {
          try {
            const { initiatePayout } = await import("@/lib/payments/pawapay");
            const { randomUUID } = await import("crypto");
            const payoutId = randomUUID();
            const payoutResponse = await initiatePayout({
              payoutId,
              amount: String(amountMWK),
              currency: withdrawal.currency || "MWK",
              phoneNumber: withdrawal.phone,
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
                  body: `${amountMWK.toLocaleString()} has been sent to ${withdrawal.phone} via ${withdrawal.operator_name}.`,
                  data: { amount: amountMWK, phone: withdrawal.phone, operator: withdrawal.operator_name, auto: true, fees: totalFees, provider: "pawapay" },
                  read: false,
                });
              } catch {}
            }
          } catch (payoutErr: any) {
            console.error("Auto-approve PawaPay payout error:", payoutErr);
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
                mobile: withdrawal.phone,
                mobile_money_operator_ref_id: withdrawal.operator_ref_id,
                amount: String(amountMWK),
                charge_id: chargeId,
              }),
            });

            const payoutData = await payoutResponse.json();

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
          }
        }

        if (!payoutSucceeded) {
          await admin.rpc("refund_withdrawal", { p_withdrawal_id: withdrawalId, p_admin_id: null });
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
