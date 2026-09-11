/**
 * Ontech Payments client — Zambian mobile-money + bank gateway.
 * https://payments.ontech.co.zm  (API docs: /api/docs, OpenAPI: /api/openapi.json)
 *
 * Merchant app: "Crazy Chess Battles" (code CCB). Auth = X-API-Key header
 * (NOT the X-Admin-Key the docs claim for merchant endpoints).
 *
 * Endpoints used:
 *   POST /pay/collect          — mobile money deposit (Airtel/MTN/Zamtel)
 *   GET  /pay/status/{txn}     — collection status by Ontech transaction id
 *   GET  /pay/collection/status/{reference} — by our own reference
 *   POST /disburse/send        — payout to mobile money (bank_code AIRTEL/MTN/
 *                                ZAMTEL → transfer_type "mobile_money") or a
 *                                Zambian bank account
 *   GET  /disburse/status/{id} — payout status
 *   GET  /disburse/banks       — supported banks
 *
 * The account is sandbox (is_live: false) until Ontech flips it live.
 *
 * Env:
 *   PAYMENT_GATEWAY_BASE_URL      — https://payments.ontech.co.zm/api/v1
 *   PAYMENT_GATEWAY_API_KEY       — merchant API key (X-API-Key)
 *   PAYMENT_GATEWAY_WEBHOOK_SECRET — for signed callbacks (not used yet; v1 polls)
 */

// ─── Pure helpers ─────────────────────────────────────────────────────────

/**
 * Normalize a Zambian mobile number to local format 0XXXXXXXXX.
 * Accepts +260 / 260 prefixes, spaces, dashes. Returns null if not a valid
 * ZM mobile number (Airtel 096/097, MTN 076/077/078/079, Zamtel 095).
 */
export function normalizeZmPhone(raw: string): string | null {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("260")) d = "0" + d.slice(3);
  if (d.length === 9 && !d.startsWith("0")) d = "0" + d;
  if (!/^0(9[567]|7[6789])\d{7}$/.test(d)) return null;
  return d;
}

/** Carrier code for a normalized ZM phone — matches Ontech's bank_code values. */
export function zmCarrier(phone: string): "AIRTEL" | "MTN" | "ZAMTEL" | null {
  if (!/^0\d{9}$/.test(phone)) return null;
  const p = phone.slice(0, 3);
  if (p === "096" || p === "097") return "AIRTEL";
  if (["076", "077", "078", "079"].includes(p)) return "MTN";
  if (p === "095") return "ZAMTEL";
  return null;
}

/** Player-facing carrier label. */
export function zmCarrierName(code: string | null): string {
  if (code === "AIRTEL") return "Airtel Money";
  if (code === "MTN") return "MTN MoMo";
  if (code === "ZAMTEL") return "Zamtel Kwacha";
  return "Mobile Money";
}

/** Convert a ZMW amount to whole MWK units using the MWK→ZMW rate. */
export function zmwToMwk(amountZmw: number, rateMwkToZmw: number): number {
  if (!rateMwkToZmw || rateMwkToZmw <= 0) return 0;
  return Math.max(1, Math.round(amountZmw / rateMwkToZmw));
}

/** Convert whole MWK units to ZMW (2dp). */
export function mwkToZmw(amountMwk: number, rateMwkToZmw: number): number {
  if (!rateMwkToZmw || rateMwkToZmw <= 0) return 0;
  return Math.round(amountMwk * rateMwkToZmw * 100) / 100;
}

export function isOntechConfigured(): boolean {
  return Boolean(process.env.PAYMENT_GATEWAY_API_KEY);
}

// ─── Webhook / callback mapping (unchanged behaviour) ─────────────────────

export type OntechEvent =
  | "payment.success"
  | "payment.completed"
  | "payment.failed"
  | "payment.reversed"
  | "disbursement.completed"
  | "disbursement.failed"
  | string;

export interface OntechCallback {
  event?: OntechEvent;
  type?: OntechEvent;
  status?: string;
  reference?: string;
  transactionId?: string;
  transaction_id?: string;
  depositId?: string;
  payoutId?: string;
  amount?: number | string;
  [key: string]: unknown;
}

/** Normalizes any of the known event/status shapes to our internal 3-state model. */
export function mapOntechStatus(body: OntechCallback): "success" | "failed" | "pending" {
  const key = String(body.event || body.type || body.status || "").toLowerCase();
  if (key.includes("success") || key.includes("completed")) return "success";
  if (key.includes("failed") || key.includes("reversed") || key.includes("cancelled")) return "failed";
  return "pending";
}

/** True if this callback describes a disbursement (payout/withdrawal) rather than a collection (deposit). */
export function isOntechDisbursement(body: OntechCallback): boolean {
  const key = String(body.event || body.type || "").toLowerCase();
  return key.startsWith("disbursement") || key.startsWith("cashout");
}

/** Best-effort extraction of the merchant reference we generated for this payment. */
export function ontechReference(body: OntechCallback): string | null {
  return body.reference || body.transactionId || body.transaction_id || body.depositId || body.payoutId || null;
}

// ─── Gateway HTTP client ─────────────────────────────────────────────────

const BASE_URL = () =>
  process.env.PAYMENT_GATEWAY_BASE_URL || "https://payments.ontech.co.zm/api/v1";

function headers(reference?: string): Record<string, string> {
  const h: Record<string, string> = {
    "X-API-Key": process.env.PAYMENT_GATEWAY_API_KEY || "",
    "Content-Type": "application/json",
  };
  if (reference) h["x-idempotency-key"] = reference;
  return h;
}

export interface OntechCollectArgs {
  /** Amount in ZMW. */
  amount: number;
  /** Normalized local ZM number (09…/07…). */
  phone: string;
  /** Our unique merchant reference (idempotency key). */
  reference: string;
  description?: string;
  customerName?: string;
}

export interface OntechCollectResult {
  success: boolean;
  status: "success" | "pending" | "failed";
  transactionId: string | null;
  provider: string | null;
  message: string | null;
  raw?: unknown;
}

/** Initiate a mobile money collection — the payer gets a PIN prompt on their phone. */
export async function ontechCollect(args: OntechCollectArgs): Promise<OntechCollectResult> {
  try {
    const res = await fetch(`${BASE_URL()}/pay/collect`, {
      method: "POST",
      headers: headers(args.reference),
      body: JSON.stringify({
        amount: args.amount,
        phone: args.phone,
        reference: args.reference,
        description: args.description || "Wallet deposit",
        customer_name: args.customerName || undefined,
      }),
      // collection initiation should be quick; give the aggregator room
      signal: AbortSignal.timeout(30_000),
    });
    const data: any = await res.json();
    if (!res.ok || data.success === false) {
      return { success: false, status: "failed", transactionId: null, provider: null, message: data.detail || data.message || `HTTP ${res.status}`, raw: data };
    }
    // Sandbox auto-succeeds; live returns pending until the payer approves.
    const st = String(data.status || "").toLowerCase();
    return {
      success: true,
      status: st === "success" ? "success" : st === "failed" ? "failed" : "pending",
      transactionId: data.transaction_id || null,
      provider: data.provider || null,
      message: data.message || null,
      raw: data,
    };
  } catch (err: any) {
    return { success: false, status: "failed", transactionId: null, provider: null, message: err?.message || "network error" };
  }
}

export interface OntechStatusResult {
  status: "success" | "failed" | "pending" | "unknown";
  transactionId: string | null;
  amount: number | null;
  message: string | null;
  raw?: unknown;
}

/** Query collection status by Ontech transaction id, then by our own reference. */
export async function ontechCollectionStatus(transactionId: string | null, reference: string): Promise<OntechStatusResult> {
  try {
    if (transactionId) {
      const res = await fetch(`${BASE_URL()}/pay/status/${encodeURIComponent(transactionId)}`, { headers: headers(), signal: AbortSignal.timeout(15_000) });
      if (res.ok) {
        const d: any = await res.json();
        const st = String(d.status || "").toLowerCase();
        if (st === "success" || st === "failed" || st === "pending") {
          return { status: st, transactionId: d.transaction_id || transactionId, amount: d.amount ?? null, message: d.message || null, raw: d };
        }
      }
    }
    const res2 = await fetch(`${BASE_URL()}/pay/collection/status/${encodeURIComponent(reference)}`, { headers: headers(), signal: AbortSignal.timeout(15_000) });
    const d2: any = await res2.ok ? await res2.json() : {};
    // /pay/query-style response: {success, code, code_name, message}
    const codeName = String(d2.code_name || "").toUpperCase();
    const st2 = codeName === "SUCCESS" ? "success" : codeName === "FAILED" ? "failed" : d2.success ? "pending" : "unknown";
    return { status: st2, transactionId: null, amount: null, message: d2.message || null, raw: d2 };
  } catch {
    return { status: "unknown", transactionId: null, amount: null, message: null };
  }
}

export interface OntechDisburseArgs {
  recipientName: string;
  /** MM number (with carrier in bankCode) or bank account number. */
  recipientAccount: string;
  /** AIRTEL | MTN | ZAMTEL (mobile money) or a bank code (ZANACO…). */
  bankCode: string;
  /** Amount in ZMW. */
  amount: number;
  narration?: string;
  reference?: string;
}

export interface OntechDisburseResult {
  success: boolean;
  status: "completed" | "pending" | "failed";
  disbursementId: string | null;
  transferType: string | null;
  message: string | null;
  raw?: unknown;
}

/** Payout to mobile money or a Zambian bank account (single endpoint). */
export async function ontechDisburse(args: OntechDisburseArgs): Promise<OntechDisburseResult> {
  try {
    const res = await fetch(`${BASE_URL()}/disburse/send`, {
      method: "POST",
      headers: headers(args.reference),
      body: JSON.stringify({
        recipient_name: args.recipientName,
        recipient_account: args.recipientAccount,
        bank_code: args.bankCode,
        amount: args.amount,
        narration: args.narration || "CCB withdrawal",
        reference: args.reference || undefined,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const data: any = await res.json();
    if (!res.ok || data.success === false) {
      return { success: false, status: "failed", disbursementId: null, transferType: null, message: Array.isArray(data.detail) ? JSON.stringify(data.detail) : (data.detail || data.message || `HTTP ${res.status}`), raw: data };
    }
    const st = String(data.status || "").toLowerCase();
    return {
      success: true,
      status: st === "completed" ? "completed" : st === "failed" ? "failed" : "pending",
      disbursementId: data.disbursement_id || null,
      transferType: data.transfer_type || null,
      message: data.status_message || null,
      raw: data,
    };
  } catch (err: any) {
    return { success: false, status: "failed", disbursementId: null, transferType: null, message: err?.message || "network error" };
  }
}

export interface OntechBank { code: string; name: string; type: string }

let banksCache: { banks: OntechBank[]; fetchedAt: number } | null = null;

/** Zambian banks supported for payouts (1h cache). */
export async function ontechBanks(): Promise<OntechBank[]> {
  if (banksCache && Date.now() - banksCache.fetchedAt < 3_600_000) return banksCache.banks;
  try {
    const res = await fetch(`${BASE_URL()}/disburse/banks`, { headers: headers(), signal: AbortSignal.timeout(15_000) });
    const data: any = await res.json();
    const banks = (data.banks || []) as OntechBank[];
    if (res.ok && banks.length) {
      banksCache = { banks, fetchedAt: Date.now() };
      return banks;
    }
    return [];
  } catch {
    return [];
  }
}
