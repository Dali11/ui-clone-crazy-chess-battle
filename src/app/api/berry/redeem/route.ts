import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { berries } = await req.json();

    if (!berries || typeof berries !== "number" || berries <= 0) {
      return NextResponse.json({ error: "Invalid berry amount" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Get berry config
    const { data: config } = await admin
      .from("berry_config")
      .select("berry_value, min_redemption, enabled")
      .limit(1)
      .single();

    if (!config || !config.enabled) {
      return NextResponse.json({ error: "Berry redemption is disabled" }, { status: 400 });
    }

    if (berries < config.min_redemption) {
      return NextResponse.json({ error: `Minimum redemption is ${config.min_redemption} berries` }, { status: 400 });
    }

    // Calculate cash value: 100 berries = berry_value
    const cashAmount = Math.round((berries / 100) * config.berry_value);

    if (cashAmount < 100) {
      return NextResponse.json({ error: "Redemption amount too small" }, { status: 400 });
    }

    // Get user's current berry balance
    const { data: profile } = await admin
      .from("profiles")
      .select("berry_balance, wallet_balance")
      .eq("id", user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    if (profile.berry_balance < berries) {
      return NextResponse.json({ error: `Insufficient berries. You have ${profile.berry_balance}.` }, { status: 400 });
    }

    // Debit berries
    await admin.rpc("debit_berries", {
      p_user_id: user.id,
      p_amount: berries,
      p_description: `Redeemed ${berries} berries for MWK ${cashAmount.toLocaleString()}`,
    });

    // Credit wallet
    await admin.rpc("credit_wallet", {
      p_user_id: user.id,
      p_amount: cashAmount,
    });

    return NextResponse.json({
      success: true,
      berriesRedeemed: berries,
      cashAmount,
      cashFormatted: `MWK ${cashAmount.toLocaleString()}`,
      newBerryBalance: profile.berry_balance - berries,
      newWalletBalance: profile.wallet_balance + cashAmount,
    });
  } catch (e: any) {
    console.error("Berry redeem error:", e);
    return NextResponse.json({ error: e.message || "Redemption failed" }, { status: 500 });
  }
}
