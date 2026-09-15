/**
 * Deposit phone numbers — anti OTP-spam guard (raised by Gordon on the
 * PawaPay compliance call). Players can save up to 3 numbers in Settings;
 * once saved they're locked (DB trigger enforces this — see migration 078)
 * and every deposit/mobile-money route must check the submitted phone
 * against this saved list before initiating a payment. Withdrawals are
 * unaffected — those stay free-text and can go to any number.
 */

export const MAX_DEPOSIT_PHONES = 3;

/** Last 9 digits, so +265991234567 / 265991234567 / 0991234567 all match. */
export function normalizePhoneDigits(phone: string | null | undefined): string {
  const digits = (phone || "").replace(/\D/g, "");
  return digits.slice(-9);
}

export function isValidPhoneFormat(phone: string | null | undefined): boolean {
  return /^\+?[0-9]{7,15}$/.test((phone || "").trim());
}

export function isAllowedDepositPhone(
  allowed: string[] | null | undefined,
  candidate: string | null | undefined
): boolean {
  const target = normalizePhoneDigits(candidate);
  if (!target) return false;
  return (allowed || []).some((p) => normalizePhoneDigits(p) === target);
}

export function dedupePhones(numbers: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of numbers) {
    const key = normalizePhoneDigits(n);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(n.trim());
  }
  return out;
}
