import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { amountCents, phone, operatorRefId, operatorName } = await req.json();

    // Minimum withdrawal is MWK 10,000 (1,000,000 cents)
    if (!amountCents || amountCents < 1000000) {
      return NextResponse.json({ error: "Minimum withdrawal is MWK 10,000" }, { status: 400 });
    }
    if (!phone || !operatorRefId || !operatorName) {
      return NextResponse.json({ error: "Phone, operator required" }, { status: 400 });
    }

    // Validate phone format (Malawi: 08x, 09x, +265, 265)
    const phoneDigits = phone.replace(/\D/g, "");
    const localPhone = phoneDigits.startsWith("265") ? "0" + phoneDigits.slice(3) : phoneDigits;
    if (localPhone.length < 9 || !localPhone.match(/^0[89]/)) {
      return NextResponse.json({ error: "Invalid Malawi mobile money number" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Check for existing pending withdrawal (prevent spam)
    const { data: existingPending } = await admin
      .from("withdrawals")
      .select("id, amount_cents")
      .eq("user_id", user.id)
      .eq("status", "pending")
      .limit(1);

    if (existingPending && existingPending.length > 0) {
      return NextResponse.json({ error: "You already have a pending withdrawal. Wait for it to be processed before requesting another." }, { status: 400 });
    }

    // Call the atomic request_withdrawal RPC
    const { data: withdrawalId, error } = await admin.rpc("request_withdrawal", {
      p_user_id: user.id,
      p_amount_cents: amountCents,
      p_phone: phone,
      p_operator_ref_id: operatorRefId,
      p_operator_name: operatorName,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ withdrawalId, status: "pending" });
  } catch (err: any) {
    return NextResponse.json({ error: "Failed to request withdrawal. Please try again." }, { status: 500 });
  }
}
