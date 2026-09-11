/**
 * Ontech Payments client — Zambian mobile-money aggregator.
 * https://ontech.co.zm
 *
 * Trialled as a Zambia payout/collection alternative to PawaPay, which
 * requires a gambling license CCB can't afford yet. Registered merchant
 * app: code "CCB".
 *
 * We don't have the deposit/disbursement-initiation API docs wired up
 * yet — this file currently only supports the WEBHOOK side (status
 * mapping) so the callback URL can be registered and test-fired from
 * the Ontech dashboard. Once Arthur shares the API key + base URL for
 * initiating payments, extend this with initiateDeposit/initiatePayout
 * mirroring src/lib/payments/pawapay.ts.
 *
 * Env vars (not required yet — webhook works without them):
 *   ONTECH_API_KEY        — merchant API key, for initiating payments (TODO)
 *   ONTECH_WEBHOOK_SECRET — if Ontech provides HMAC signing, verify with it
 */

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
  // Reference field names are unconfirmed — we try several common ones
  // in the webhook handler until we see a real payload.
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
  return key.startsWith("disbursement");
}

/** Best-effort extraction of the merchant reference we generated for this payment. */
export function ontechReference(body: OntechCallback): string | null {
  return (
    (body.reference as string) ||
    (body.transactionId as string) ||
    (body.transaction_id as string) ||
    (body.depositId as string) ||
    (body.payoutId as string) ||
    null
  );
}
