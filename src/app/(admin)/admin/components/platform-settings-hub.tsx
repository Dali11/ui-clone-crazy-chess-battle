"use client";

import { useState, memo } from "react";
import {
  LayoutDashboard, Users, ArrowDownUp, Trophy, Loader2, Gamepad2,
  Swords, Shield, Calendar, Crown,
  Search, SlidersHorizontal, Database, ChevronDown, ScrollText,
  ShieldCheck, DollarSign, Megaphone, Zap, Radio, Globe } from "lucide-react";
import PlatformSettingsPanel from "../platform-settings-panel";

function PlatformSettingsHubBase() {
  const [settingsSection, setSettingsSection] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["battles", "withdrawals"]));

  const settingSections = [
    { id: "ads", label: "Ads", icon: Megaphone, desc: "Placements, ad scripts, kill switch" },
    { id: "push", label: "Push", icon: Radio, desc: "Notifications, throttle gaps" },
    { id: "battles", label: "Battles", icon: Swords, desc: "Stakes, fees, auto-cancel" },
    { id: "withdrawals", label: "Withdrawals", icon: ArrowDownUp, desc: "Limits, fees, approval" },
    { id: "payments_zm", label: "Zambia", icon: Globe, desc: "Ontech K-amount limits, mobile + bank" },
    { id: "deposits", label: "Deposits", icon: DollarSign, desc: "Limits, auto-credit, approval" },
    { id: "tournaments", label: "Tournaments", icon: Trophy, desc: "Approval, max players" },
    { id: "games", label: "Games", icon: Gamepad2, desc: "Spectators, concurrency" },
    { id: "users", label: "Users", icon: Users, desc: "Signups, verification, admin" },
    { id: "leagues_xp", label: "XP Leagues", icon: Zap, desc: "XP rules, weekly rewards, promotion/demotion" },
    { id: "verification", label: "Verification", icon: ShieldCheck, desc: "ID, selfie, auto-approve" },
    { id: "logs", label: "Logs", icon: ScrollText, desc: "Retention period" },
    { id: "overview", label: "Dashboard", icon: LayoutDashboard, desc: "Refresh, KPI cards" },
  ];

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredSections = settingSections.filter(s => {
    if (searchQuery) {
      return s.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
             s.desc.toLowerCase().includes(searchQuery.toLowerCase());
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* HEADER */}
      <div className="card p-4 sm:p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-ccb-primary/10 flex items-center justify-center">
            <SlidersHorizontal className="w-5 h-5 text-ccb-primary" />
          </div>
          <div>
            <h2 className="font-bold text-lg">Platform Settings</h2>
            <p className="text-xs text-ccb-muted">Configure all platform behavior in one place. Changes apply instantly across the entire site.</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ccb-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search settings..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-ccb-surface border border-ccb-border text-sm focus:outline-none focus:border-ccb-primary/50"
          />
        </div>
      </div>

      {/* QUICK NAV CHIPS */}
      <div className="flex gap-1.5 flex-wrap">
        {settingSections.map(s => {
          const Icon = s.icon;
          const isExpanded = expandedSections.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggleSection(s.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                isExpanded
                  ? "bg-ccb-primary text-white"
                  : "bg-ccb-surface text-ccb-muted hover:text-ccb-text border border-ccb-border"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* SETTINGS SECTIONS */}
      <div className="space-y-3">
        {filteredSections.map(s => {
          const Icon = s.icon;
          const isExpanded = expandedSections.has(s.id);
          return (
            <div key={s.id} className={`card overflow-hidden transition-all ${isExpanded ? "" : "opacity-60"}`}>
              <button
                onClick={() => toggleSection(s.id)}
                className="w-full flex items-center gap-3 p-4 hover:bg-ccb-surface/50 transition-colors"
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                  isExpanded ? "bg-ccb-primary/10 text-ccb-primary" : "bg-ccb-surface text-ccb-muted"
                }`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="font-bold text-sm">{s.label}</div>
                  <div className="text-xs text-ccb-muted truncate">{s.desc}</div>
                </div>
                <ChevronDown className={`w-4 h-4 text-ccb-muted transition-transform shrink-0 ${isExpanded ? "rotate-180" : ""}`} />
              </button>
              {isExpanded && (
                <div className="px-4 pb-4 border-t border-ccb-border/50">
                  <PlatformSettingsPanel section={s.id} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FOOTER NOTE */}
      <div className="card p-4 flex items-start gap-2.5">
        <Database className="w-4 h-4 text-ccb-muted shrink-0 mt-0.5" />
        <p className="text-xs text-ccb-muted">
          Settings are stored in the <code className="text-ccb-text font-mono">platform_settings</code> table and synced to legacy config tables (battle_config, withdrawal_config) automatically. All backend routes read from these values.
        </p>
      </div>
    </div>
  );
}

const PlatformSettingsHub = memo(PlatformSettingsHubBase);
export default PlatformSettingsHub;
