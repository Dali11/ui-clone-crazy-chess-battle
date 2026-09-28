import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { JOB_DEFS, deriveHealth, sectionForJob, JobStatus } from "@/lib/jobs";

/**
 * GET /api/admin/jobs — health of every scheduled system job.
 * Merges stored heartbeats (platform_settings sections "job:<path>") with
 * the job registry; derives healthy/failing/stale/never per job.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const admin = createAdminClient();
    const { data: me } = await admin.from("profiles").select("is_admin").eq("id", user.id).single();
    if (!me?.is_admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sections = JOB_DEFS.map((d) => sectionForJob(d.path));
    const { data: rows } = await admin
      .from("platform_settings")
      .select("section, config")
      .in("section", sections);

    const jobs: JobStatus[] = JOB_DEFS.map((def) => {
      const row = rows?.find((r) => r.section === sectionForJob(def.path));
      const cfg = row?.config || {};
      const lastRun = cfg.last_run || null;
      const lastHttp = cfg.last_http ?? null;
      return {
        path: def.path,
        label: def.label,
        schedule: def.schedule,
        intervalMin: def.intervalMin,
        lastRun,
        lastHttp,
        lastDurationMs: cfg.duration_ms ?? null,
        health: deriveHealth(def, lastRun, lastHttp),
      };
    });

    const failing = jobs.filter((j) => j.health === "failing").length;
    const stale = jobs.filter((j) => j.health === "stale").length;

    return NextResponse.json({ jobs, failing, stale, total: jobs.length });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to fetch jobs" }, { status: 500 });
  }
}
