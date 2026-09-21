/**
 * Malawi MSISDN canonicalization for PayChangu payment rails.
 *
 * Live incident 2026-09-17/18 on withdrawals: PayChangu's API rejects
 * non-local phone formats ("+265 986…" etc.) outright. The withdrawals
 * route was fixed then — but the deposit route kept sending the raw
 * string, so every deposit from a number saved in international format
 * failed (11/11 in the two weeks to 2026-09-21, players retrying 4-7x).
 * Deposits now canonicalize through this helper before calling PayChangu.
 */

/**
 * Canonicalize any Malawi mobile number to the local MSISDN format
 * PayChangu expects: "09XXXXXXXX" / "08XXXXXXXX" (leading 0, 9 digits).
 *
 * Accepts "+265991234567", "265 991 23 45 67", "0991234567", "991234567".
 * @returns the canonical local number, or null when the digits can't be
 * a valid Malawi mobile (wrong length / not an 08- or 09- prefix).
 */
export function toMalawiLocalMsisdn(raw: string | null | undefined): string | null {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return null;

  let local = digits;
  if (local.startsWith("265")) local = local.slice(3);
  if (local.startsWith("0")) local = local.slice(1);
  // 9 significant digits follow the leading 0 (09|08 + 8 digits)
  if (local.length !== 9) return null;
  local = "0" + local;
  if (!/^0[89]/.test(local)) return null;
  return local;
}
