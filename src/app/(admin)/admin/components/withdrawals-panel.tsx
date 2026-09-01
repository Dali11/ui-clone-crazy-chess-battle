"use client";

import { useState } from "react";
import { Check, X, Loader2, Settings, Search, Clock, ArrowDownUp, Users, Smartphone, AlertCircle } from "lucide-react";
import PlatformSettingsPanel from "../platform-settings-panel";
import { type Withdrawal } from "../types";
import { ConfigInput } from "./shared";

interface WithdrawalsPanelProps {
  withdrawals: Withdrawal[];
  withdrawalFilter: string;
  setWithdrawalFilter: (v: string) => void;
  withdrawalSearch: string;
  setWithdrawalSearch: (v: string) => void;
  withdrawalConfig: any;
  setWithdrawalConfig: (v: any) => void;
  withdrawalConfigSaving: boolean;
  setWithdrawalConfigSaving: (v: boolean) => void;
  financeConfigSaving: boolean;
  setFinanceConfigSaving: (v: boolean) => void;
  rejectReason: string;
  setRejectReason: (v: string) => void;
  rejectingId: string | null;
  setRejectingId: (v: string | null) => void;
  actionLoading: string | null;
  configEdit: Record<string, string>;
  setConfigEdit: (v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  handleApprove: (id: string) => Promise<void>;
  handleRejectWithReason: (id: string) => Promise<void>;
  handleSaveFinanceConfig: (updates: Record<string, any>) => Promise<void>;
  handleToggleAutoApprove: (enabled: boolean) => Promise<void>;
  formatMWK: (amount: number) => string;
  formatDate: (d: string) => string;
}

export default function WithdrawalsPanel({
  withdrawals, withdrawalFilter, setWithdrawalFilter,
  withdrawalSearch, setWithdrawalSearch,
  withdrawalConfig, setWithdrawalConfig,
  withdrawalConfigSaving, setWithdrawalConfigSaving,
  financeConfigSaving, setFinanceConfigSaving,
  rejectReason, setRejectReason,
  rejectingId, setRejectingId,
  actionLoading, configEdit, setConfigEdit,
  handleApprove, handleRejectWithReason, handleSaveFinanceConfig, handleToggleAutoApprove,
  formatMWK, formatDate,
}: WithdrawalsPanelProps) {
  return (
      <div className="space-y-4">
        <PlatformSettingsPanel section="withdrawals" />
        {/* Finance Config Panel */}
        {withdrawalConfig && (
          <div className="card border-ccb-primary/20">
            <div className="flex items-center gap-2 mb-3">
              <Settings className="w-4 h-4 text-ccb-primary" />
              <h3 className="text-sm font-bold">Withdrawal & Deposit Settings</h3>
            </div>

            {/* Auto-approve toggle */}
            <div className="flex items-center justify-between gap-3 py-2">
              <div>
                <p className="text-sm font-medium">Auto-Approve Withdrawals</p>
                <p className="text-xs text-ccb-muted mt-0.5">
                  {withdrawalConfig.auto_approve_enabled
                    ? "Withdrawals process automatically via Paychangu."
                    : "Withdrawals require manual admin approval."}
                </p>
              </div>
              <button
                onClick={() => handleToggleAutoApprove(!withdrawalConfig.auto_approve_enabled)}
                disabled={withdrawalConfigSaving}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${
                  withdrawalConfig.auto_approve_enabled ? "bg-ccb-success" : "bg-ccb-border"
                } disabled:opacity-50`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  withdrawalConfig.auto_approve_enabled ? "translate-x-6" : "translate-x-1"
                }`} />
              </button>
            </div>

            <div className="border-t border-ccb-border my-3" />

            {/* Config grid */}
            <div className="grid grid-cols-2 gap-3">
              {/* Min withdrawal */}
              <div>
                <label className="text-xs font-medium text-ccb-muted">Min Withdrawal (MK)</label>
                <input
                  type="number"
                  value={configEdit.min_withdrawal ?? (withdrawalConfig.min_withdrawal || 10000)}
                  onChange={(e) => setConfigEdit(prev => ({ ...prev, min_withdrawal: e.target.value }))}
                  className="input mt-1 w-full text-sm"
                  placeholder="10"
                />
              </div>
              {/* Max withdrawal */}
              <div>
                <label className="text-xs font-medium text-ccb-muted">Max Withdrawal (MK)</label>
                <input
                  type="number"
                  value={configEdit.max_withdrawal ?? (withdrawalConfig.max_withdrawal || 500000)}
                  onChange={(e) => setConfigEdit(prev => ({ ...prev, max_withdrawal: e.target.value }))}
                  className="input mt-1 w-full text-sm"
                  placeholder="50000"
                />
              </div>
              {/* Min deposit */}
              <div>
                <label className="text-xs font-medium text-ccb-muted">Min Deposit (MK)</label>
                <input
                  type="number"
                  value={configEdit.min_deposit ?? (withdrawalConfig.min_deposit || 500)}
                  onChange={(e) => setConfigEdit(prev => ({ ...prev, min_deposit: e.target.value }))}
                  className="input mt-1 w-full text-sm"
                  placeholder="5"
                />
              </div>
              {/* Daily withdrawal limit */}
              <div>
                <label className="text-xs font-medium text-ccb-muted">Daily Withdrawal Limit (MK)</label>
                <input
                  type="number"
                  value={configEdit.daily_withdrawal_limit ?? (withdrawalConfig.daily_withdrawal_limit || 100000)}
                  onChange={(e) => setConfigEdit(prev => ({ ...prev, daily_withdrawal_limit: e.target.value }))}
                  className="input mt-1 w-full text-sm"
                  placeholder="10000"
                />
              </div>
              {/* Withdrawal fee */}
              <div>
                <label className="text-xs font-medium text-ccb-muted">Withdrawal Fee (MK)</label>
                <input
                  type="number"
                  value={configEdit.withdrawal_fee ?? (withdrawalConfig.withdrawal_fee || 0)}
                  onChange={(e) => setConfigEdit(prev => ({ ...prev, withdrawal_fee: e.target.value }))}
                  className="input mt-1 w-full text-sm"
                  placeholder="0"
                />
              </div>
              {/* Processing fee % */}
              <div>
                <label className="text-xs font-medium text-ccb-muted">Processing Fee (%)</label>
                <input
                  type="number"
                  step="0.01"
                  value={configEdit.processing_fee_pct ?? (withdrawalConfig.processing_fee_pct || 0)}
                  onChange={(e) => setConfigEdit(prev => ({ ...prev, processing_fee_pct: e.target.value }))}
                  className="input mt-1 w-full text-sm"
                  placeholder="0.00"
                />
              </div>
            </div>

            <button
              onClick={() => {
                const updates: Record<string, number> = {};
                if (configEdit.min_withdrawal !== undefined)
                  updates.min_withdrawal = Number(configEdit.min_withdrawal);
                if (configEdit.max_withdrawal !== undefined)
                  updates.max_withdrawal = Number(configEdit.max_withdrawal);
                if (configEdit.min_deposit !== undefined)
                  updates.min_deposit = Number(configEdit.min_deposit);
                if (configEdit.daily_withdrawal_limit !== undefined)
                  updates.daily_withdrawal_limit = Number(configEdit.daily_withdrawal_limit);
                if (configEdit.withdrawal_fee !== undefined)
                  updates.withdrawal_fee = Number(configEdit.withdrawal_fee);
                if (configEdit.processing_fee_pct !== undefined)
                  updates.processing_fee_pct = Number(configEdit.processing_fee_pct);
                if (Object.keys(updates).length > 0) handleSaveFinanceConfig(updates);
              }}
              disabled={financeConfigSaving || Object.keys(configEdit).length === 0}
              className="btn-primary w-full mt-3 text-sm py-2 disabled:opacity-50"
            >
              {financeConfigSaving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save Settings"}
            </button>
          </div>
        )}

        {/* Withdrawal stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="card text-center">
            <p className="text-xs text-ccb-muted">Total Paid Out</p>
            <p className="text-lg font-bold mt-1">
              {formatMWK(withdrawals.reduce((s, w) => s + (w.status === "completed" ? w.amount : 0), 0))}
            </p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-ccb-muted">Pending</p>
            <p className="text-lg font-bold mt-1 text-ccb-accent">
              {withdrawals.filter(w => w.status === "pending").length}
            </p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-ccb-muted">Rejected</p>
            <p className="text-lg font-bold mt-1 text-ccb-danger">
              {withdrawals.filter(w => w.status === "rejected").length}
            </p>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="Search by name, phone, or amount..."
            value={withdrawalSearch}
            onChange={(e) => setWithdrawalSearch(e.target.value)}
            className="input w-full text-sm"
          />
          <div className="flex gap-2 flex-wrap">
            {["pending", "completed", "approved", "rejected", "all"].map((f) => (
              <button
                key={f}
                onClick={() => setWithdrawalFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
                  withdrawalFilter === f
                    ? "bg-ccb-primary/10 text-ccb-primary border border-ccb-primary/30"
                    : "text-ccb-muted hover:text-ccb-text border border-transparent"
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {(() => {
          const filtered = withdrawals.filter(w => {
            if (withdrawalFilter !== "all" && w.status !== withdrawalFilter) return false;
            if (withdrawalSearch) {
              const q = withdrawalSearch.toLowerCase();
              const name = (w.profiles?.display_name || w.profiles?.username || "").toLowerCase();
              return name.includes(q) || w.phone.includes(q) || String(w.amount).includes(q);
            }
            return true;
          });

          if (filtered.length === 0) {
            return (
              <div className="text-center py-12 text-ccb-muted text-sm">
                <ArrowDownUp className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No withdrawals found
              </div>
            );
          }

          return (
            <div className="space-y-2">
              {filtered.map((w) => (
                <div key={w.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold">{formatMWK(w.amount)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          w.status === "completed" ? "bg-ccb-success/10 text-ccb-success" :
                          w.status === "pending" ? "bg-ccb-accent/10 text-ccb-accent" :
                          w.status === "rejected" ? "bg-ccb-danger/10 text-ccb-danger" :
                          w.status === "approved" ? "bg-ccb-primary/10 text-ccb-primary" :
                          "bg-ccb-surface text-ccb-muted"
                        }`}>{w.status}</span>
                      </div>
                      <div className="text-xs text-ccb-muted mt-1.5 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3 h-3" />
                          {w.profiles?.display_name || w.profiles?.username || "Unknown"}
                          {w.profiles?.email ? ` · ${w.profiles.email}` : ""}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Smartphone className="w-3 h-3" />
                          {w.phone} · {w.operator_name}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          {formatDate(w.created_at)}
                        </div>
                        {w.admin_notes && (
                          <div className="flex items-center gap-1.5 text-ccb-danger">
                            <AlertCircle className="w-3 h-3" />
                            {w.admin_notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {w.status === "pending" && (
                    <div className="mt-3 pt-3 border-t border-ccb-border space-y-2">
                      {rejectingId === w.id ? (
                        <div className="space-y-2">
                          <textarea
                            placeholder="Reason for rejection (shown to user)..."
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            className="input w-full text-sm resize-none"
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleRejectWithReason(w.id)}
                              disabled={actionLoading === w.id}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-danger text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                            >
                              {actionLoading === w.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                              Confirm Reject
                            </button>
                            <button
                              onClick={() => { setRejectingId(null); setRejectReason(""); }}
                              className="px-3 py-1.5 rounded-lg text-ccb-muted text-xs font-medium hover:text-ccb-text"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleApprove(w.id)}
                            disabled={actionLoading === w.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-success text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                          >
                            {actionLoading === w.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Approve & Send
                          </button>
                          <button
                            onClick={() => { setRejectingId(w.id); setRejectReason(""); }}
                            disabled={actionLoading === w.id}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-danger text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                          >
                            <X className="w-3.5 h-3.5" /> Reject & Refund
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

  );
}
