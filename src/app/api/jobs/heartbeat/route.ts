import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sectionForJob } from "@/lib/jobs";

/**
 * POST /api/jobs/heartbeat
 *
 * Called by docker/cron-runner.sh after every cron job with the path,
 * HTTP status and duration. Stores the latest run per job in
 * platform_settings under section "job:<path>" — one row per job so
 * concurrent jobs never clobber each other.
 *
 * Auth: Bearer CRON_SECRET (cron runner) or an authenticated admin.
 */
export async function POST(req: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.get("authorization");
    const isAdmin = await (async () => {
      if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
      const { createClient } = await import("@/lib/supabase/server");
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;
      const admin = createAdminClient();
      const { data: me } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
      return !!me?.is_admin;
    })();
    if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const path = String(body.job || "").trim();
    const http = Number(body.http);
    const durationMs = Number(body.duration_ms ?? 0);
    if (!path.startsWith("/api/")) {
      return NextResponse.json({ error: "Invalid job path" }, { status: 400 });
    }

    const admin = createAdminClient();
    const config = {
      last_run: new Date().toISOString(),
      last_http: Number.isFinite(http) ? http : null,
      duration_ms: Number.isFinite(durationMs) ? durationMs : null,
    };

    const { error } = await admin
      .from("platform_settings")
      .upsert({ section: sectionForJob(path), config }, { onConflict: "section" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, job: path, ...config });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Heartbeat failed" }, { status: 500 });
  }
}
