import { toMalawiLocalMsisdn } from "./malawi-phone";

/**
 * Canonicalize a deposit phone number AT SAVE TIME (Settings), based on
 * the player's country.
 *
 * Players paste numbers in every shape: "+265 991 23 45 67", "09912…",
 * "991234567", "260767430234". Previously the raw string was stored as
 * typed, and every consumer (deposit routes, operator detection, UI
 * display) had to tolerate every format. The payment routes normalize
 * defensively, but the stored list itself should be clean and consistent
 * so players see exactly one canonical form and dedupe checks are exact.
 *
 * Canonical forms stored per country:
 *   MW → local "09XXXXXXXX" / "08XXXXXXXX"
 *   ZM → local "0XXXXXXXXX" (10 digits, 076/096 MTN, 097/077 Airtel, 095 Zamtel)
 *   KE → local "0XXXXXXXXX" (Safaricom/Airtel/Telkom ranges)
 *   others → digits-only MSISDN with any leading + stripped
 */

export interface NormalizedDepositPhone {
  phone: string;
  error?: string;
}

function digitsOnly(raw: string): string {
  return (raw || "").replace(/\D/g, "");
}

/** Zambian local mobile: 0 + 9 digits; prefixes 095/096/097/076/077. */
function toZambiaLocalMsisdn(raw: string): string | null {
  let d = digitsOnly(raw);
  if (d.startsWith("260")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length !== 9) return null;
  const local = "0" + d;
  if (!/^0(9[567]|7[67])/.test(local)) return null;
  return local;
}

/** Kenyan local mobile: 0 + 9 digits (Safaricom/Airtel/Telkom ranges). */
function toKenyaLocalMsisdn(raw: string): string | null {
  let d = digitsOnly(raw);
  if (d.startsWith("254")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.length !== 9) return null;
  const local = "0" + d;
  if (!/^0[17]/.test(local)) return null;
  return local;
}

/**
 * Normalize a player-supplied deposit phone for the given profile country.
 * Returns { phone } on success or { phone: "", error } with a friendly
 * message when the number can't be a valid mobile number for that country.
 */
export function normalizeDepositPhone(raw: string, country: string | null | undefined): NormalizedDepositPhone {
  const c = (country || "").toUpperCase();
  const d = digitsOnly(raw);
  if (!d) return { phone: "", error: "Enter a mobile number." };

  switch (c) {
    case "MW": {
      const local = toMalawiLocalMsisdn(raw);
      if (!local) {
        return { phone: "", error: "Enter a valid Malawi mobile number, e.g. 0991234567 (or +265 991 23 45 67)." };
      }
      return { phone: local };
    }
    case "ZM": {
      const local = toZambiaLocalMsisdn(raw);
      if (!local) {
        return { phone: "", error: "Enter a valid Zambian mobile number, e.g. 0761234567 (or +260 761 234 567)." };
      }
      return { phone: local };
    }
    case "KE": {
      const local = toKenyaLocalMsisdn(raw);
      if (!local) {
        return { phone: "", error: "Enter a valid Kenyan mobile number, e.g. 0712345678 (or +254 712 345 678)." };
      }
      return { phone: local };
    }
    default: {
      // Unknown/other country: accept 8-15 digits, strip any leading +
      // (stored as a plain MSISDN; the payment routes tolerate any form).
      if (d.length < 8 || d.length > 15) {
        return { phone: "", error: "Enter a valid mobile number (8-15 digits, country code included if outside Malawi)." };
      }
      return { phone: d };
    }
  }
}

/** Player-facing format notice for the Settings deposit-phone field. */
export function depositPhoneFormatHint(country: string | null | undefined): string {
  switch ((country || "").toUpperCase()) {
    case "MW":
      return "Use a Malawi number: 0991234567, +265 991 23 45 67 or 265991234567 — we save it as 0991234567.";
    case "ZM":
      return "Use a Zambian number: 0761234567, +260 761 234 567 or 260761234567 — we save it as 0761234567.";
    case "KE":
      return "Use a Kenyan number: 0712345678, +254 712 345 678 or 254712345678 — we save it as 0712345678.";
    default:
      return "Enter your mobile number including the country code, e.g. +234 801 234 5678.";
  }
}

/** Country-aware placeholder for the deposit-phone input. */
export function depositPhonePlaceholder(country: string | null | undefined): string {
  switch ((country || "").toUpperCase()) {
    case "MW": return "e.g. 0991234567";
    case "ZM": return "e.g. 0761234567";
    case "KE": return "e.g. 0712345678";
    default: return "e.g. +2348012345678";
  }
}
