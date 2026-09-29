"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, CheckCircle2, XCircle, Clock, HelpCircle } from "lucide-react";

interface JobStatus {
  path: string;
  label: string;
  schedule: string;
  intervalMin: number;
  lastRun: string | null;
  lastHttp: number | null;
  lastDurationMs: number | null;
  health: "healthy" | "failing" | "stale" | "never";
}

/**
 * System Jobs health — every scheduled cron job, its last run, HTTP result
 * and freshness. Heartbeats come from docker/cron-runner.sh → /api/jobs/heartbeat.
 */
export default function JobsPanel() {
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true);
    try {
      const res = await fetch("/api/admin/jobs", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load jobs");
      setJobs(json.jobs || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to load jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
    const t = setInterval(() => load(false), 30_000);
    return () => clearInterval(t);
  }, [load]);

  const rel = (iso: string | null) => {
    if (!iso) return "never";
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  const meta = (j: JobStatus) => {
    switch (j.health) {
      case "healthy":
        return { icon: <CheckCircle2 className="w-4 h-4 text-ccb-success" />, text: "text-ccb-success", label: "Healthy" };
      case "failing":
        return { icon: <XCircle className="w-4 h-4 text-ccb-danger" />, text: "text-ccb-danger", label: `HTTP ${j.lastHttp ?? "—"} · failing` };
      case "stale":
        return { icon: <Clock className="w-4 h-4 text-ccb-danger" />, text: "text-ccb-danger", label: "Stale — missed schedule" };
      default:
        return { icon: <HelpCircle className="w-4 h-4 text-ccb-muted" />, text: "text-ccb-muted", label: "No runs recorded yet" };
    }
  };

  const failing = jobs.filter((j) => j.health === "failing").length;
  const stale = jobs.filter((j) => j.health === "stale").length;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {(failing > 0 || stale > 0) && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ccb-danger/10 text-ccb-danger">
              {failing > 0 && `${failing} failing`}
              {failing > 0 && stale > 0 && " · "}
              {stale > 0 && `${stale} stale`}
            </span>
          )}
          {failing === 0 && stale === 0 && jobs.length > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-ccb-success/10 text-ccb-success">
              all healthy
            </span>
          )}
        </div>
        <button onClick={() => load(true)} className="text-xs text-ccb-muted hover:text-ccb-text flex items-center gap-1">
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
        </button>
      </div>

      {error ? (
        <p className="text-xs text-ccb-danger py-2">{error}</p>
      ) : loading && jobs.length === 0 ? (
        <div className="py-6 text-center"><Loader2 className="w-5 h-5 mx-auto text-ccb-muted animate-spin" /></div>
      ) : (
        <div className="space-y-2">
          {jobs.map((j) => {
            const m = meta(j);
            return (
              <div key={j.path} className="rounded-xl border border-ccb-border p-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate">{j.label}</p>
                  <p className="text-[11px] text-ccb-muted font-mono truncate">{j.path}</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-ccb-muted font-mono">{j.schedule}</span>
                  <span className="text-ccb-muted">{j.lastDurationMs != null ? `${Math.round(j.lastDurationMs / 100) / 10}s` : "—"}</span>
                  <span className="text-ccb-muted">{rel(j.lastRun)}</span>
                  <span className={`flex items-center gap-1 font-medium ${m.text}`}>
                    {m.icon} {m.label}
                  </span>
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-ccb-muted pt-1">
            Heartbeats are written by the cron runner after every job. &quot;Stale&quot; means the job has missed several
            expected runs — check container logs if that happens.
          </p>
        </div>
      )}
    </div>
  );
}
