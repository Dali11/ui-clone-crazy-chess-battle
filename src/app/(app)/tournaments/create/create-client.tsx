"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Trophy, ShieldAlert, Info, ArrowLeft, Loader2, CheckCircle2, Sparkles,
} from "lucide-react";
import { useCurrency } from "@/hooks/use-currency";

/**
 * Player-facing tournament creation.
 *
 * Modes (non-admin):
 *  - Entry-fee funded: players' fees build the prize pool. Platform takes 5%
 *    of gross at settlement, the creator sets their own cut (max 25%), and
 *    winners split the rest.
 *  - Fixed pool: the creator funds the prize from their wallet at creation
 *    (escrowed, refunded if the tournament cancels). Entry fees go 95% to the
 *    creator / 5% to the platform once the tournament starts.
 *  - Free: no fees at all — community events.
 *
 * Requires some platform activity (enforced server-side); KYC is not required.
 */

interface Props {
  walletBalance: number; // local currency
  isAdmin: boolean;
  countryCode: string | null;
}

type PoolMode = "entry_fees" | "fixed" | "free";

const TYPE_OPTIONS = [
  { id: "arena", label: "Arena", desc: "Continuous pairing, score race" },
  { id: "swiss", label: "Swiss", desc: "Fixed rounds, no elimination" },
  { id: "knockout", label: "Knockout", desc: "Single elimination bracket" },
];

const TC_OPTIONS = [
  { id: "bullet", label: "Bullet", minutes: 1, increment: 0 },
  { id: "blitz3", label: "Blitz 3+2", minutes: 3, increment: 2 },
  { id: "blitz", label: "Blitz 5+0", minutes: 5, increment: 0 },
  { id: "rapid", label: "Rapid 10+0", minutes: 10, increment: 0 },
  { id: "rapid15", label: "Rapid 15+10", minutes: 15, increment: 10 },
  { id: "classical", label: "Classical 30+0", minutes: 30, increment: 0 },
];

export default function CreateTournamentClient({
  walletBalance,
  isAdmin,
  countryCode,
}: Props) {
  const { formatMoney, formatWallet, toMWK, currencySymbol, loaded } = useCurrency(countryCode);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("swiss");
  const [timeControl, setTimeControl] = useState("blitz");
  const [startsAt, setStartsAt] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [poolMode, setPoolMode] = useState<PoolMode>("entry_fees");
  const [entryFeeLocal, setEntryFeeLocal] = useState("");
  const [prizePoolLocal, setPrizePoolLocal] = useState("");
  const [creatorCut, setCreatorCut] = useState(10);
  const [maxPlayers, setMaxPlayers] = useState(32);
  const [minPlayers, setMinPlayers] = useState(4);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; status: string } | null>(null);

  const entryFeeMwk = poolMode === "free" ? 0 : Math.round(toMWK(Number(entryFeeLocal) || 0));
  const prizePoolMwk = poolMode === "fixed" ? Math.round(toMWK(Number(prizePoolLocal) || 0)) : 0;

  const fixedEscrowWarning = useMemo(() => {
    if (poolMode !== "fixed") return null;
    const v = Number(prizePoolLocal) || 0;
    if (v > 0 && v > walletBalance) {
      return `Your wallet balance (${formatWallet(walletBalance)}) can't cover this prize pool yet — deposit funds first or lower the amount.`;
    }
    return null;
  }, [poolMode, prizePoolLocal, walletBalance, formatWallet, walletBalance]);

  if (created) {
    return (
      <div className="max-w-xl mx-auto space-y-4 pb-20">
        <div className="card text-center p-8">
          <div className="w-14 h-14 rounded-2xl bg-ccb-success/10 border border-ccb-success/30 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-7 h-7 text-ccb-success" />
          </div>
          <h2 className="text-lg font-bold mb-2">Tournament created</h2>
          <p className="text-sm text-ccb-muted mb-5">
            {created.status === "pending_approval"
              ? "Your tournament is in the approval queue — we'll review it shortly."
              : "Your tournament is live and open for entries. Good luck!"}
          </p>
          <Link href={`/tournament/${created.id}`} className="btn-primary text-sm inline-flex px-4 py-2">
            View tournament
          </Link>
        </div>
      </div>
    );
  }

  const submit = async () => {
    setError(null);
    if (!name.trim()) return setError("Give your tournament a name.");
    if (poolMode === "fixed" && prizePoolMwk <= 0) return setError("Set a prize pool amount to fund.");
    if (poolMode !== "free" && entryFeeMwk < 0) return setError("Entry fee can't be negative.");
    if (minPlayers < 2) return setError("You need at least 2 players.");
    if (maxPlayers < minPlayers) return setError("Max players must be at least the minimum.");

    const tc = TC_OPTIONS.find(t => t.id === timeControl) || TC_OPTIONS[2];
    setSubmitting(true);
    try {
      const res = await fetch("/api/tournaments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          type,
          timeControl,
          initialMinutes: tc.minutes,
          incrementSeconds: tc.increment,
          startsAt: new Date(startsAt).toISOString(),
          entryFee: entryFeeMwk,
          poolSource: poolMode === "free" ? "entry_fees" : poolMode,
          prizePool: prizePoolMwk,
          creatorProfitPercent: poolMode === "entry_fees" && entryFeeMwk > 0 ? creatorCut : 0,
          minPlayers,
          maxPlayers,
          knockoutFormat: "pure",
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || "Failed to create tournament.");
      } else {
        setCreated({ id: json.tournament?.id || json.id, status: json.tournament?.status || "upcoming" });
      }
    } catch (e: any) {
      setError(e.message || "Network error — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const input = "w-full bg-ccb-surface border border-ccb-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ccb-accent/60";
  const label = "block text-xs font-semibold text-ccb-muted uppercase tracking-wide mb-1.5";

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-20">
      <Link href="/tournaments" className="inline-flex items-center gap-1 text-sm text-ccb-muted hover:text-ccb-text">
        <ArrowLeft className="w-4 h-4" /> Back to tournaments
      </Link>

      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-ccb-accent/10 border border-ccb-accent/30 flex items-center justify-center">
          <Trophy className="w-5 h-5 text-ccb-accent" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight">Create a Tournament</h1>
          <p className="text-xs text-ccb-muted">Host your own event, build the pot, grow the game.</p>
        </div>
      </div>

      {/* POOL MODE */}
      <div className="card p-4 space-y-3">
        <span className={label}>Funding mode</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {([
            { id: "entry_fees", title: "Entry-fee pool", desc: "Players' fees build the prize. You set your cut (max 25%). Platform fee 5%." },
            { id: "fixed", title: "Fixed prize", desc: "You fund the prize upfront (escrowed). Entry fees go to you — platform keeps 5%." },
            { id: "free", title: "Free & friendly", desc: "No entry fee, no prize. Pure community fun." },
          ] as const).map(m => (
            <button
              key={m.id}
              onClick={() => setPoolMode(m.id)}
              className={`text-left p-3 rounded-xl border transition-all ${
                poolMode === m.id
                  ? "bg-ccb-accent/10 border-ccb-accent/40"
                  : "bg-ccb-surface border-ccb-border hover:border-ccb-accent/30"
              }`}
            >
              <div className="text-sm font-bold flex items-center gap-1.5">
                {m.title}
                {m.id === "entry_fees" && <Sparkles className="w-3.5 h-3.5 text-ccb-accent" />}
              </div>
              <div className="text-[11px] text-ccb-muted mt-1 leading-snug">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* BASICS */}
      <div className="card p-4 space-y-4">
        <div>
          <span className={label}>Tournament name</span>
          <input className={input} value={name} maxLength={80} onChange={e => setName(e.target.value)} placeholder="e.g. Friday Night Blitz Arena" />
        </div>
        <div>
          <span className={label}>Description (optional)</span>
          <textarea className={input + " min-h-[70px]"} value={description} maxLength={500} onChange={e => setDescription(e.target.value)} placeholder="Tell players what to expect…" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className={label}>Format</span>
            <div className="grid grid-cols-3 gap-2">
              {TYPE_OPTIONS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setType(t.id)}
                  title={t.desc}
                  className={`px-2 py-2 rounded-lg text-xs font-semibold border transition-all ${
                    type === t.id ? "bg-ccb-accent/10 border-ccb-accent/40 text-ccb-accent" : "bg-ccb-surface border-ccb-border text-ccb-muted"
                  }`}
                >{t.label}</button>
              ))}
            </div>
          </div>
          <div>
            <span className={label}>Time control</span>
            <select className={input} value={timeControl} onChange={e => setTimeControl(e.target.value)}>
              {TC_OPTIONS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <span className={label}>Starts at</span>
            <input type="datetime-local" className={input} value={startsAt} onChange={e => setStartsAt(e.target.value)} />
          </div>
          <div>
            <span className={label}>Min players</span>
            <input type="number" min={2} max={256} className={input} value={minPlayers} onChange={e => setMinPlayers(Number(e.target.value) || 2)} />
          </div>
          <div>
            <span className={label}>Max players</span>
            <input type="number" min={2} max={256} className={input} value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value) || 32)} />
          </div>
        </div>
      </div>

      {/* MONEY */}
      {poolMode !== "free" && (
        <div className="card p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className={label}>Entry fee ({currencySymbol || ""})</span>
              <input
                type="number" min={0} step="any" className={input}
                value={entryFeeLocal} onChange={e => setEntryFeeLocal(e.target.value)}
                placeholder="0 = free entry"
                disabled={poolMode === "fixed" && false}
              />
            </div>
            {poolMode === "fixed" && (
              <div>
                <span className={label}>Prize pool you fund ({currencySymbol || ""})</span>
                <input
                  type="number" min={0} step="any" className={input}
                  value={prizePoolLocal} onChange={e => setPrizePoolLocal(e.target.value)}
                  placeholder="Escrowed from your wallet"
                />
                <p className="text-[11px] text-ccb-muted mt-1">
                  Wallet: <span className="font-semibold text-ccb-text">{formatWallet(walletBalance)}</span> · refunded in full if the tournament cancels
                </p>
              </div>
            )}
          </div>

          {poolMode === "entry_fees" && entryFeeMwk > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className={label + " mb-0"}>Your cut of the pot</span>
                <span className="text-sm font-black text-ccb-accent">{creatorCut}%</span>
              </div>
              <input
                type="range" min={0} max={25} value={creatorCut}
                onChange={e => setCreatorCut(Number(e.target.value))}
                className="w-full accent-ccb-accent"
              />
              <p className="text-[11px] text-ccb-muted mt-1 flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                {loaded && (
                  <>
                    Platform fee is 5% of gross entries. Example: {maxPlayers} players × {formatMoney(entryFeeMwk)} ≈ {formatMoney(entryFeeMwk * maxPlayers)} pot → you earn {formatMoney(Math.floor(entryFeeMwk * maxPlayers * creatorCut / 100))}, winners share the rest.
                  </>
                )}
              </p>
            </div>
          )}

          {fixedEscrowWarning && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-ccb-danger/10 border border-ccb-danger/30 text-ccb-danger text-xs">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" /> {fixedEscrowWarning}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-ccb-danger/10 border border-ccb-danger/30 text-ccb-danger text-sm">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <button onClick={submit} disabled={submitting || !!fixedEscrowWarning} className="btn-primary w-full py-3 font-bold flex items-center justify-center gap-2">
        {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</> : <><Trophy className="w-4 h-4" /> Create tournament</>}
      </button>
    </div>
  );
}
