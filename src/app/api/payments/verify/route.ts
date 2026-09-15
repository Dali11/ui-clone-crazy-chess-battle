import { NextRequest, NextResponse } from "next/server";
import { moneySymbol } from "@/lib/geo/format";
import { formatMoneyConverted } from "@/lib/geo/server-format";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkDepositStatus, mapPawaPayStatus } from "@/lib/payments/pawapay";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { chargeId } = await req.json();
    if (!chargeId) return NextResponse.json({ error: "Charge ID required" }, { status: 400 });

    const admin = createAdminClient();

    let { data: deposit } = await admin
      .from("deposits")
      .select("id, user_id, amount, status, method, payment_provider, pawapay_ref, amount_local, currency")
      .eq("charge_id", chargeId)
      .single();

    if (!deposit) {
      const { data: txDeposit } = await admin
        .from("deposits")
        .select("id, user_id, amount, status, method, payment_provider, pawapay_ref, amount_local, currency")
        .eq("tx_ref", chargeId)
        .single();
      deposit = txDeposit;
    }

    if (!deposit) return NextResponse.json({ error: "Deposit not found" }, { status: 404 });
    if (deposit.user_id !== user.id) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    // Already successfully processed — return immediately (idempotent)
    if (deposit.status === "success") {
      return NextResponse.json({ status: "success", depositId: deposit.id, amount: deposit.amount });
    }

    // Already being processed by another request — return pending
    if (deposit.status === "processing") {
      return NextResponse.json({ status: "pending", depositId: deposit.id });
    }

    // ── PawaPay deposits/memberships: check status with PawaPay directly ──
    if (deposit.payment_provider === "pawapay" && deposit.pawapay_ref) {
      let remote: Awaited<ReturnType<typeof checkDepositStatus>>;
      try {
        remote = await checkDepositStatus(deposit.pawapay_ref);
      } catch {
        return NextResponse.json({ status: "pending", depositId: deposit.id });
      }
      const pwStatus = mapPawaPayStatus(remote.status as any);

      if (pwStatus === "failed") {
        await admin.from("deposits")
          .update({ status: "failed", updated_at: new Date().toISOString() })
          .eq("id", deposit.id);
        return NextResponse.json({ status: "failed", depositId: deposit.id });
      }
      if (pwStatus !== "success") {
        return NextResponse.json({ status: "pending", depositId: deposit.id });
      }

      // ATOMIC GUARD: claim pending -> processing
      const { data: claimed, error: claimErr } = await admin
        .from("deposits")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", deposit.id)
        .eq("status", "pending")
        .select("id");

      if (claimErr || !claimed || claimed.length === 0) {
        return NextResponse.json({ status: "success", depositId: deposit.id, amount: deposit.amount_local ?? deposit.amount });
      }

      // Membership purchases don't credit the wallet — they extend membership.
      if (deposit.method === "membership_purchase") {
        const { extendMembership } = await import("@/lib/membership/membership");
        const { data: mp } = await admin
          .from("profiles")
          .select("membership_until")
          .eq("id", deposit.user_id)
          .single();
        const now = new Date().toISOString();
        const { getPlatformConfig } = await import("@/lib/platform-config");
        const memCfg = await getPlatformConfig(admin, "membership");
        const periodDays = Number(memCfg.period_days) || 30;
        const until = extendMembership(mp?.membership_until, now, periodDays);
        await admin.from("profiles")
          .update({ membership_until: until })
          .eq("id", deposit.user_id);

        await admin.from("deposits")
          .update({ status: "success", updated_at: now })
          .eq("id", deposit.id);

        try {
          await admin.from("notifications").insert({
            user_id: deposit.user_id,
            type: "membership_active",
            title: "Membership active 🎉",
            body: `You're a member until ${until.slice(0, 10)} — ads are off. Thanks for supporting Crazy Chess Battles!`,
            data: { until, amount: deposit.amount },
            read: false,
          });
        } catch {}

        try {
          const affCfg = await getPlatformConfig(admin, "affiliate");
          if (affCfg.enabled) {
            await admin.rpc("process_affiliate_commission", {
              p_user_id: deposit.user_id,
              p_amount: Math.round(deposit.amount),
            });
          }
        } catch (affErr) {
          console.error("affiliate commission failed:", affErr);
        }

        return NextResponse.json({ status: "success", membership: true, until, depositId: deposit.id, amount: deposit.amount });
      }

      // Normal deposit — credit wallet (credit_wallet converts MWK equiv
      // to the player's local wallet currency).
      await admin.rpc("credit_wallet", {
        p_user_id: deposit.user_id,
        p_amount: deposit.amount,
      });

      await admin.from("deposits")
        .update({ status: "success", updated_at: new Date().toISOString() })
        .eq("id", deposit.id);

      try {
        await admin.from("notifications").insert({
          user_id: deposit.user_id,
          type: "deposit_success",
          title: "Deposit confirmed",
          body: `Your deposit of ${(deposit.amount_local ?? deposit.amount).toLocaleString()}${deposit.currency && deposit.currency !== "MWK" ? ` ${deposit.currency}` : ""} has been credited to your wallet.`,
          data: { amount: deposit.amount, method: "pawapay" },
          read: false,
        });
      } catch {}

      // amount in the player's wallet currency so the client's optimistic
      // balance add matches the wallet
      return NextResponse.json({ status: "success", depositId: deposit.id, amount: deposit.amount_local ?? deposit.amount });
    }

    // Correct PayChangu endpoints per https://developer.paychangu.com/docs/charge-verification
    let verifyUrl: string;
    if (deposit.method === "mobile_money") {
      verifyUrl = `https://api.paychangu.com/mobile-money/payments/${chargeId}/verify`;
    } else {
      verifyUrl = `https://api.paychangu.com/verify-payment/${chargeId}`;
    }

    const res = await fetch(verifyUrl, {
      headers: {
        Authorization: `Bearer ${process.env.PAYCHANGU_SECRET_KEY}`,
        Accept: "application/json",
      },
    });

    const data = await res.json();
    const remoteStatus = data.data?.status || data.status;

    if (remoteStatus === "success" || remoteStatus === "successful") {
      // ATOMIC GUARD: claim this deposit by atomically moving it from "pending" to "processing"
      // If another concurrent request already claimed it, this returns 0 rows and we skip crediting
      const { data: claimed, error: claimErr } = await admin
        .from("deposits")
        .update({ status: "processing", updated_at: new Date().toISOString() })
        .eq("id", deposit.id)
        .eq("status", "pending")
        .select("id");

      if (claimErr || !claimed || claimed.length === 0) {
        // Another request is already processing or has processed this deposit
        return NextResponse.json({ status: "success", depositId: deposit.id, amount: deposit.amount });
      }

      // Membership purchases don't credit the wallet — they extend membership.
      // The cash stays in the platform's PayChangu merchant account (revenue,
      // swept weekly to the owner).
      if (deposit.method === "membership_purchase") {
        const { extendMembership } = await import("@/lib/membership/membership");
        const { data: mp } = await admin
          .from("profiles")
          .select("membership_until")
          .eq("id", deposit.user_id)
          .single();
        const now = new Date().toISOString();
        const { getPlatformConfig } = await import("@/lib/platform-config");
        const memCfg = await getPlatformConfig(admin, "membership");
        const periodDays = Number(memCfg.period_days) || 30;
        const until = extendMembership(mp?.membership_until, now, periodDays);
        await admin.from("profiles")
          .update({ membership_until: until })
          .eq("id", deposit.user_id);

        await admin.from("deposits")
          .update({ status: "success", updated_at: now })
          .eq("id", deposit.id);

        try {
          await admin.from("notifications").insert({
            user_id: deposit.user_id,
            type: "membership_active",
            title: "Membership active 🎉",
            body: `You're a member until ${until.slice(0, 10)} — ads are off. Thanks for supporting Crazy Chess Battles!`,
            data: { until, amount: deposit.amount },
            read: false,
          });
        } catch {}

        // Affiliate commission (when the buyer used a referral link and the
        // program switch is ON): pays the referrer 25%, properly ledgered.
        // Wrapped so a commission failure never blocks membership activation.
        try {
          const { getPlatformConfig } = await import("@/lib/platform-config");
          const affCfg = await getPlatformConfig(admin, "affiliate");
          if (affCfg.enabled) {
            await admin.rpc("process_affiliate_commission", {
              p_user_id: deposit.user_id,
              p_amount: Math.round(deposit.amount),
            });
          }
        } catch (affErr) {
          console.error("affiliate commission failed:", affErr);
        }

        return NextResponse.json({ status: "success", membership: true, until, depositId: deposit.id, amount: deposit.amount });
      }

      // We won the race — safe to credit the wallet
      await admin.rpc("credit_wallet", {
        p_user_id: user.id,
        p_amount: deposit.amount,
      });

      // Mark as success
      await admin.from("deposits")
        .update({ status: "success", updated_at: new Date().toISOString() })
        .eq("id", deposit.id);

      // Notify user
      const amountMWK = deposit.amount;
    const { data: _up } = await admin.from("profiles").select("country").eq("id", deposit.user_id).single();
    const sym = moneySymbol(_up?.country);
      try {
        await admin.from("notifications").insert({
          user_id: user.id,
          type: "deposit_success",
          title: "Deposit confirmed",
          body: `Your deposit of ${await formatMoneyConverted(amountMWK, _up?.country)} has been credited to your wallet.`,
          data: { amount: amountMWK, method: deposit.method },
          read: false,
        });
      } catch {}

      return NextResponse.json({ status: "success", depositId: deposit.id, amount: deposit.amount });
    }

    if (remoteStatus === "failed" || remoteStatus === "cancelled") {
      await admin.from("deposits")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", deposit.id);
      return NextResponse.json({ status: "failed", depositId: deposit.id });
    }

    return NextResponse.json({ status: remoteStatus || "pending", depositId: deposit.id });
  } catch (e: any) {
    console.error("Verify error:", e);
    return NextResponse.json({ error: "Verification failed. Please try again." }, { status: 500 });
  }
}
