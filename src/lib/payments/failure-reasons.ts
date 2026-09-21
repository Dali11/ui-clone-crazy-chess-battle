/**
 * Friendly, player-facing explanations for deposit failures.
 *
 * Providers (PawaPay / PayChangu) return machine failure codes; the
 * wallet used to show every failure as a generic "Payment failed. Please
 * try again." Players then assumed the platform was broken and retried
 * repeatedly (live data: ZMW 1,100 MTN attempts ×6 in one day, all
 * INSUFFICIENT_BALANCE). Routes persist the raw provider payload in
 * deposits.admin_notes; the verify endpoint maps it back to these
 * human-readable reasons so the player knows what to actually do.
 */

export const DEPOSIT_FAILURE_MESSAGES: Record<string, string> = {
  INSUFFICIENT_BALANCE:
    "Your mobile money wallet doesn't have enough funds for this deposit. Top up your phone wallet and try again.",
  PAYMENT_NOT_APPROVED:
    "The payment wasn't approved — you may have missed the PIN prompt or entered the wrong PIN. Try again and approve the prompt on your phone.",
  PAYER_NOT_FOUND:
    "That number isn't registered with the selected mobile money network. Check the number and provider in Settings.",
  INVALID_PAYER_FORMAT:
    "The phone number format was rejected by the provider. Update your number in Settings and try again.",
  INVALID_AMOUNT:
    "The provider rejected this amount — it may be below or above their per-transaction limits.",
  TIMEOUT:
    "The payment request expired before it was approved. Try again and approve the prompt promptly.",
};

/**
 * Extract a friendly failure reason from a deposits.admin_notes payload.
 * The notes field holds the raw provider failure object (JSON) or a
 * plain-text message. Returns null when there's nothing useful.
 */
export function describeDepositFailure(adminNotes: string | null | undefined): string | null {
  if (!adminNotes) return null;

  // JSON payload form: { failureReason: { failureCode, failureMessage } }
  try {
    const parsed = JSON.parse(adminNotes);
    const code = parsed?.failureReason?.failureCode || parsed?.failureCode;
    if (code && DEPOSIT_FAILURE_MESSAGES[code]) return DEPOSIT_FAILURE_MESSAGES[code];
    if (parsed?.failureReason?.failureMessage) return parsed.failureReason.failureMessage;
  } catch {
    // not JSON — fall through
  }

  // Plain-text fallback: look for a known code embedded in the message
  for (const code of Object.keys(DEPOSIT_FAILURE_MESSAGES)) {
    if (adminNotes.includes(code)) return DEPOSIT_FAILURE_MESSAGES[code];
  }
  return adminNotes.length < 200 ? adminNotes : null;
}
