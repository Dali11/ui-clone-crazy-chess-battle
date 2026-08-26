import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET — Berry transaction history for the authenticated user.
 * Returns all berry_transactions rows, newest first, with pagination.
 *
 * Query params:
 *   limit  — max records (default 50, max 200)
 *   offset — skip N records for pagination
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 200);
    const offset = parseInt(searchParams.get("offset") || "0");

    const admin = createAdminClient();

    const { data: transactions, error } = await admin
      .from("berry_transactions")
      .select("id, type, amount, balance_after, game_id, description, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error("Berry history error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Also fetch current balance
    const { data: profile } = await admin
      .from("profiles")
      .select("berry_balance")
      .eq("id", user.id)
      .single();

    // Categorize transactions for easier reading
    const categorized = (transactions || []).map((tx: any) => {
      const desc = tx.description || "";
      let category = "other";

      if (desc.toLowerCase().includes("welcome")) category = "welcome_bonus";
      else if (desc.toLowerCase().includes("daily check-in") || desc.toLowerCase().includes("streak")) category = "daily_checkin";
      else if (desc.toLowerCase().includes("tournament")) category = "tournament";
      else if (desc.toLowerCase().includes("bot")) category = "bot_game";
      else if (desc.toLowerCase().includes("quick match") || desc.toLowerCase().includes("casual")) category = "quick_match";
      else if (desc.toLowerCase().includes("referral")) category = "referral";
      else if (desc.toLowerCase().includes("shared") || desc.toLowerCase().includes("whatsapp") || desc.toLowerCase().includes("profile") || desc.toLowerCase().includes("first game")) category = "engagement";
      else if (tx.type === "redeemed") category = "redemption";
      else if (desc.toLowerCase().includes("admin")) category = "admin_adjustment";

      return { ...tx, category };
    });

    return NextResponse.json({
      transactions: categorized,
      currentBalance: profile?.berry_balance ?? 0,
      count: categorized.length,
      hasMore: categorized.length === limit,
    });
  } catch (e: any) {
    console.error("Berry history error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
