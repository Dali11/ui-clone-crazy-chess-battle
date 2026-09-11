import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ontechBanks } from "@/lib/payments/ontech";

/** Zambian banks available for Ontech payouts (auth'd players only). */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const banks = await ontechBanks();
  return NextResponse.json({ banks });
}
