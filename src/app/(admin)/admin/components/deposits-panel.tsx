"use client";

import { useState } from "react";
import { Check, X, Loader2, Search, Smartphone, Coins, DollarSign, Users, Clock, FileText, Shield } from "lucide-react";
import PlatformSettingsPanel from "../platform-settings-panel";
import { type Deposit } from "../types";

interface DepositsPanelProps {
  deposits: Deposit[];
  depositFilter: string;
  setDepositFilter: (v: string) => void;
  depositSearch: string;
  setDepositSearch: (v: string) => void;
  actionLoading: string | null;
  creditingId: string | null;
  setCreditingId: (v: string | null) => void;
  creditNotes: string;
  setCreditNotes: (v: string) => void;
  handleVerifyDeposit: (id: string) => Promise<void>;
  handleRejectDeposit: (id: string) => Promise<void>;
  handleCreditWithNotes: (id: string) => Promise<void>;
  formatMWK: (amount: number) => string;
  formatDate: (d: string) => string;
}

export default function DepositsPanel({
  deposits, depositFilter, setDepositFilter,
  depositSearch, setDepositSearch,
  actionLoading, creditingId, setCreditingId,
  creditNotes, setCreditNotes,
  handleVerifyDeposit, handleRejectDeposit, handleCreditWithNotes,
  formatMWK, formatDate,
}: DepositsPanelProps) {
  return (
      <div className="space-y-4">
        <PlatformSettingsPanel section="deposits" />
        {/* Deposit stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          <div className="card text-center">
            <p className="text-xs text-ccb-muted">Total Credited</p>
            <p className="text-base font-bold mt-1">
              {formatMWK(deposits.reduce((s, d) => s + (d.status === "success" ? d.amount : 0), 0))}
            </p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-ccb-muted">Pending</p>
            <p className="text-base font-bold mt-1 text-ccb-accent">
              {deposits.filter(d => d.status === "pending").length}
            </p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-ccb-muted">Successful</p>
            <p className="text-base font-bold mt-1 text-ccb-success">
              {deposits.filter(d => d.status === "success").length}
            </p>
          </div>
          <div className="card text-center">
            <p className="text-xs text-ccb-muted">Failed</p>
            <p className="text-base font-bold mt-1 text-ccb-danger">
              {deposits.filter(d => d.status === "failed").length}
            </p>
          </div>
        </div>

        {/* Search + Filters */}
        <div className="flex flex-col gap-2">
          <input
            type="text"
            placeholder="Search by name, phone, tx ref, or amount..."
            value={depositSearch}
            onChange={(e) => setDepositSearch(e.target.value)}
            className="input w-full text-sm"
          />
          <div className="flex gap-2 flex-wrap">
            {["all", "pending", "processing", "success", "failed"].map((f) => (
              <button
                key={f}
                onClick={() => setDepositFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-all ${
                  depositFilter === f
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
          const filtered = deposits.filter(d => {
            if (depositFilter !== "all" && d.status !== depositFilter) return false;
            if (depositSearch) {
              const q = depositSearch.toLowerCase();
              const name = (d.profiles?.display_name || d.profiles?.username || "").toLowerCase();
              return name.includes(q) ||
                (d.phone || "").includes(q) ||
                (d.tx_ref || "").toLowerCase().includes(q) ||
                (d.charge_id || "").toLowerCase().includes(q) ||
                String(d.amount).includes(q);
            }
            return true;
          });

          if (filtered.length === 0) {
            return (
              <div className="text-center py-12 text-ccb-muted text-sm">
                <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-50" />
                No deposits found
              </div>
            );
          }

          return (
            <div className="space-y-2">
              {filtered.map((d) => (
                <div key={d.id} className="card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{formatMWK(d.amount)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded ${
                          d.status === "success" ? "bg-ccb-success/10 text-ccb-success" :
                          d.status === "pending" ? "bg-ccb-accent/10 text-ccb-accent" :
                          d.status === "processing" ? "bg-ccb-primary/10 text-ccb-primary" :
                          d.status === "failed" ? "bg-ccb-danger/10 text-ccb-danger" :
                          "bg-ccb-surface text-ccb-muted"
                        }`}>{d.status}</span>
                        <span className="text-xs text-ccb-muted">{d.method === "mobile_money" ? "MoMo" : d.method}</span>
                      </div>
                      <div className="text-xs text-ccb-muted mt-1.5 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <Users className="w-3 h-3" />
                          {d.profiles?.display_name || d.profiles?.username || "Unknown"}
                          {d.profiles?.email ? ` · ${d.profiles.email}` : ""}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Smartphone className="w-3 h-3" />
                          {d.method === "mobile_money" ? "Mobile Money" : "Card"}
                          {d.phone ? ` · ${d.phone}` : ""}
                          {d.operator ? ` · ${d.operator}` : ""}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3" />
                          {formatDate(d.created_at)}
                          {d.tx_ref ? ` · ${d.tx_ref.slice(0, 24)}...` : ""}
                        </div>
                        {d.admin_notes && (
                          <div className="flex items-center gap-1.5 text-ccb-muted">
                            <FileText className="w-3 h-3" />
                            {d.admin_notes}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons for pending/processing deposits */}
                  {(d.status === "pending" || d.status === "processing") && (
                    <div className="mt-3 pt-3 border-t border-ccb-border space-y-2">
                      {creditingId === d.id ? (
                        <div className="space-y-2">
                          <textarea
                            placeholder="Reason for manual credit (e.g. 'Paychangu confirmed via dashboard')..."
                            value={creditNotes}
                            onChange={(e) => setCreditNotes(e.target.value)}
                            className="input w-full text-sm resize-none"
                            rows={2}
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleCreditWithNotes(d.id)}
                              disabled={actionLoading === `${d.id}_credit`}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-success text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                            >
                              {actionLoading === `${d.id}_credit` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              Confirm Credit
                            </button>
                            <button
                              onClick={() => { setCreditingId(null); setCreditNotes(""); }}
                              className="px-3 py-1.5 rounded-lg text-ccb-muted text-xs font-medium hover:text-ccb-text"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2 flex-wrap">
                          <button
                            onClick={() => handleVerifyDeposit(d.id)}
                            disabled={actionLoading === `${d.id}_verify`}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-primary text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                          >
                            {actionLoading === `${d.id}_verify` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Shield className="w-3.5 h-3.5" />}
                            Verify
                          </button>
                          <button
                            onClick={() => { setCreditingId(d.id); setCreditNotes(""); }}
                            disabled={actionLoading === `${d.id}_credit`}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-success text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                          >
                            <Check className="w-3.5 h-3.5" /> Manual Credit
                          </button>
                          <button
                            onClick={() => handleRejectDeposit(d.id)}
                            disabled={actionLoading === `${d.id}_reject`}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-ccb-danger text-white text-xs font-medium hover:opacity-90 disabled:opacity-50"
                          >
                            {actionLoading === `${d.id}_reject` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                            Reject
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
