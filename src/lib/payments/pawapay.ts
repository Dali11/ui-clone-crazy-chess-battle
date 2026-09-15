/**
 * PawaPay Merchant API client — pan-African mobile money payments.
 *
 * One API covers 20+ African markets (MTN, Airtel, MPesa, Moov, etc.)
 * Docs: https://docs.pawapay.io/v2/docs/welcome
 *
 * Env vars:
 *   PAWAPAY_API_KEY    — Bearer token from PawaPay dashboard
 *   PAWAPAY_SANDBOX    — "true" to use sandbox endpoint (default: false)
 */

const SANDBOX_URL = "https://api.sandbox.pawapay.io/v2";
const PROD_URL = "https://api.pawapay.io/v2";

export function pawapayBaseUrl(): string {
  return process.env.PAWAPAY_SANDBOX === "true" ? SANDBOX_URL : PROD_URL;
}

export function pawapayHeaders(): Record<string, string> {
  const token = process.env.PAWAPAY_API_KEY || process.env.PAWAPAY_API_TOKEN;
  if (!token) throw new Error("PAWAPAY_API_KEY not configured");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// ─── Types ─────────────────────────────────────────────────────────────

export interface PawaPayCountry {
  country: string;
  prefix: string;
  flag: string;
  displayName: { en: string; fr?: string };
  providers: PawaPayProvider[];
}

export interface PawaPayProvider {
  provider: string;
  displayName: string;
  logo: string;
  currencies: Array<{
    currency: string;
    displayName: string;
    operationTypes: Record<string, boolean>;
  }>;
}

export interface PawaPayActiveConfig {
  companyName: string;
  countries: PawaPayCountry[];
}

export interface PawaPayPredictResult {
  country: string;
  provider: string;
  phoneNumber: string;
}

export type PawaPayStatus = "ACCEPTED" | "COMPLETED" | "FAILED" | "REJECTED" | "ENQUEUED";

export interface PawaPayDepositResponse {
  depositId: string;
  status: PawaPayStatus;
  nextStep?: string;
  created: string;
}

export interface PawaPayPayoutResponse {
  payoutId: string;
  status: PawaPayStatus;
  created: string;
}

export interface PawaPayCallback {
  depositId?: string;
  payoutId?: string;
  status: PawaPayStatus;
  amount: string;
  currency: string;
  country: string;
  payer?: {
    type: string;
    accountDetails: { phoneNumber: string; provider: string };
  };
  recipient?: {
    type: string;
    accountDetails: { phoneNumber: string; provider: string };
  };
  created: string;
  providerTransactionId?: string;
  customerMessage?: string;
}

// ─── API Methods ────────────────────────────────────────────────────────

export async function getActiveConfig(
  country?: string,
  operationType?: "DEPOSIT" | "PAYOUT"
): Promise<PawaPayActiveConfig> {
  const params = new URLSearchParams();
  if (country) params.set("country", country);
  if (operationType) params.set("operationType", operationType);

  const url = `${pawapayBaseUrl()}/active-conf${params.toString() ? `?${params}` : ""}`;
  const res = await fetch(url, { headers: pawapayHeaders() });
  const data = await res.json();

  if (!res.ok) {
    const msg = data?.failureReason?.failureMessage || data?.message || res.statusText;
    throw new Error(`PawaPay active-conf failed: ${msg}`);
  }
  return data as PawaPayActiveConfig;
}

export async function predictProvider(phoneNumber: string): Promise<PawaPayPredictResult> {
  const res = await fetch(`${pawapayBaseUrl()}/predict-provider`, {
    method: "POST",
    headers: pawapayHeaders(),
    body: JSON.stringify({ phoneNumber }),
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || data.error || "Invalid phone number");
  }
  return data as PawaPayPredictResult;
}

export async function initiateDeposit(params: {
  depositId: string;
  amount: string;
  currency: string;
  phoneNumber: string;
  provider: string;
}): Promise<PawaPayDepositResponse> {
  const res = await fetch(`${pawapayBaseUrl()}/deposits`, {
    method: "POST",
    headers: pawapayHeaders(),
    body: JSON.stringify({
      depositId: params.depositId,
      amount: params.amount,
      currency: params.currency,
      payer: {
        type: "MMO",
        accountDetails: {
          phoneNumber: params.phoneNumber,
          provider: params.provider,
        },
      },
    }),
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to initiate deposit");
  }
  return data as PawaPayDepositResponse;
}

export async function checkDepositStatus(depositId: string): Promise<PawaPayDepositResponse & { amount?: string; currency?: string; country?: string }> {
  const res = await fetch(`${pawapayBaseUrl()}/deposits/${depositId}`, {
    headers: pawapayHeaders(),
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Failed to check deposit status");
  }
  return data;
}

export async function initiatePayout(params: {
  payoutId: string;
  amount: string;
  currency: string;
  phoneNumber: string;
  provider: string;
}): Promise<PawaPayPayoutResponse> {
  const res = await fetch(`${pawapayBaseUrl()}/payouts`, {
    method: "POST",
    headers: pawapayHeaders(),
    body: JSON.stringify({
      payoutId: params.payoutId,
      amount: params.amount,
      currency: params.currency,
      recipient: {
        type: "MMO",
        accountDetails: {
          phoneNumber: params.phoneNumber,
          provider: params.provider,
        },
      },
    }),
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to initiate payout");
  }
  return data as PawaPayPayoutResponse;
}

export async function checkPayoutStatus(payoutId: string): Promise<PawaPayPayoutResponse & { amount?: string; currency?: string; country?: string }> {
  const res = await fetch(`${pawapayBaseUrl()}/payouts/${payoutId}`, {
    headers: pawapayHeaders(),
  });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.message || "Failed to check payout status");
  }
  return data;
}

export function mapPawaPayStatus(status: PawaPayStatus): "success" | "failed" | "pending" {
  switch (status) {
    case "COMPLETED":
      return "success";
    case "FAILED":
    case "REJECTED":
      return "failed";
    default:
      return "pending";
  }
}
