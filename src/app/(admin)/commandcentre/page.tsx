import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CommandCentreClient from "./commandcentre-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * /commandcentre — Admin Command Centre (Phase 1).
 *
 * Three layers of gating (mirrors the legacy /admin panel):
 *   1. Middleware protectedRoutes — 307 to /signup for unauthenticated.
 *   2. (admin) route-group layout — layout-level user + is_admin check.
 *   3. In-page check below — belt-and-suspenders server gate.
 * The data APIs additionally enforce their own auth via requireAdmin.
 * Purely additive: the legacy /admin panel is untouched.
 */
export default async function CommandCentrePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?redirect=/commandcentre");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();
  if (!profile?.is_admin) redirect("/dashboard");

  return <CommandCentreClient />;
}
