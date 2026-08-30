"use client";

import { Loader2 } from "lucide-react";
import { memo } from "react";

function StatCardBase({ icon: Icon, label, value, color }: { icon: any; label: string; value: any; color: string }) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-ccb-muted">{label}</span>
      </div>
      <p className="text-xl font-bold">{value}</p>
    </div>
  );
}
export const StatCard = memo(StatCardBase);

function ActionButtonBase({ children, onClick, loading, variant }: { children: React.ReactNode; onClick: () => void; loading: boolean; variant: "primary" | "danger" | "success" | "default" }) {
  const colors = {
    primary: "bg-ccb-primary/10 text-ccb-primary hover:bg-ccb-primary/20",
    danger: "bg-ccb-danger/10 text-ccb-danger hover:bg-ccb-danger/20",
    success: "bg-ccb-success/10 text-ccb-success hover:bg-ccb-success/20",
    default: "bg-ccb-surface text-ccb-muted hover:text-ccb-text border border-ccb-border",
  };
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-50 ${colors[variant]}`}
    >
      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : children}
    </button>
  );
}
export const ActionButton = memo(ActionButtonBase);

function ConfigInputBase({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="text-xs text-ccb-muted mb-1 block">{label}</label>
      <input
        type="number"
        value={value ?? 0}
        onChange={(e) => onChange(parseInt(e.target.value) || 0)}
        className="w-full px-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm"
      />
    </div>
  );
}
export const ConfigInput = memo(ConfigInputBase);
