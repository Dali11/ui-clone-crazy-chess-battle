// ISO 3166-1 alpha-2 -> alpha-3 country code map.
// PawaPay's API identifies countries by alpha-3 (e.g. "KEN", "ZMB", "MWI"),
// while the rest of the app (profile.country, geo detection) uses alpha-2
// (e.g. "KE", "ZM", "MW"). Convert at the PawaPay API boundary.
export const ALPHA2_TO_ALPHA3: Record<string, string> = {
  MW: "MWI", ZM: "ZMB", KE: "KEN", TZ: "TZA", ZW: "ZWE", MZ: "MOZ",
  UG: "UGA", RW: "RWA", BW: "BWA", NA: "NAM", NG: "NGA", GH: "GHA",
  EG: "EGY", MA: "MAR", DZ: "DZA", TN: "TUN", ET: "ETH", CI: "CIV",
  SN: "SEN", ML: "MLI", CM: "CMR", CD: "COD", AO: "AGO", MG: "MDG",
  MU: "MUS", SC: "SYC", SZ: "SWZ", LS: "LSO", ZA: "ZAF", BJ: "BEN",
  US: "USA", GB: "GBR", CA: "CAN", MX: "MEX", BR: "BRA", AR: "ARG",
  CL: "CHL", CO: "COL", PE: "PER", DE: "DEU", FR: "FRA", IT: "ITA",
  ES: "ESP", PT: "PRT", NL: "NLD", BE: "BEL", IE: "IRL", AT: "AUT",
  FI: "FIN", GR: "GRC", LU: "LUX", MT: "MLT", CY: "CYP", SK: "SVK",
  SI: "SVN", EE: "EST", LV: "LVA", LT: "LTU", HR: "HRV", CH: "CHE",
  NO: "NOR", SE: "SWE", DK: "DNK", IS: "ISL", PL: "POL", CZ: "CZE",
  HU: "HUN", RO: "ROU", BG: "BGR", RS: "SRB", UA: "UKR", RU: "RUS",
  TR: "TUR", IL: "ISR", SA: "SAU", AE: "ARE", QA: "QAT", KW: "KWT",
  BH: "BHR", OM: "OMN", JO: "JOR", LB: "LBN", IQ: "IRQ", IR: "IRN",
  PK: "PAK", IN: "IND", BD: "BGD", LK: "LKA", NP: "NPL", CN: "CHN",
  HK: "HKG", TW: "TWN", JP: "JPN", KR: "KOR", SG: "SGP", MY: "MYS",
  TH: "THA", VN: "VNM", PH: "PHL", ID: "IDN", AU: "AUS", NZ: "NZL",
  FJ: "FJI",
};

/** Convert an alpha-2 country code to alpha-3. Falls back to the input
 *  unchanged if unknown (already alpha-3, or genuinely unmapped). */
export function toAlpha3(countryCode: string | null | undefined): string {
  const c = (countryCode || "").toUpperCase();
  if (!c) return c;
  if (c.length === 3) return c; // already alpha-3
  return ALPHA2_TO_ALPHA3[c] || c;
}

// ISO 3166-1 alpha-2 -> international dialing code (no "+"). Covers
// PawaPay's live countries plus common others. Used to normalize a
// player-entered local number (e.g. "0727620855") into the MSISDN format
// PawaPay's API requires (e.g. "254727620855" — digits only, no leading
// 0, no "+", no separators).
export const ALPHA2_TO_DIALING_CODE: Record<string, string> = {
  BJ: "229", CI: "225", CM: "237", CD: "243", CG: "242", GA: "241",
  KE: "254", MZ: "258", MW: "265", RW: "250", SN: "221", SL: "232",
  UG: "256", ZM: "260", TZ: "255", ZW: "263", NA: "264", NG: "234",
  GH: "233", ET: "251", ZA: "27", MG: "261", ML: "223",
};

/** Normalize a player-entered phone number into PayChangu's mobile-money
 *  format. PayChangu is Malawi-only and its payouts API REQUIRES the local
 *  MSISDN (e.g. "0999086648"). Live incident 2026-09-17/18: withdrawals whose
 *  stored phone was "+265992620513" or "+265 986 57 23 21" were sent raw and
 *  PayChangu rejected every one instantly (auto-refund, status "rejected"),
 *  while clean local-format numbers on the same day paid out fine.
 *  Accepts local (09...), international (+265.../265...) and spaced forms. */
export function toPaychanguMobile(rawPhone: string, countryCode: string | null | undefined): string {
  let digits = (rawPhone || "").replace(/\D/g, "");
  const dial = ALPHA2_TO_DIALING_CODE[(countryCode || "").toUpperCase()];
  if (dial && digits.startsWith(dial)) {
    digits = "0" + digits.slice(dial.length);
  }
  return digits;
}

/** Normalize a player-entered phone number into PawaPay's MSISDN format:
 *  digits only, country dialing code prefix, no leading 0, no "+". */
export function toPawaPayMsisdn(rawPhone: string, countryCode: string | null | undefined): string {
  let digits = (rawPhone || "").replace(/\D/g, "");
  const dial = ALPHA2_TO_DIALING_CODE[(countryCode || "").toUpperCase()];
  if (!dial) return digits; // unknown country — pass through, let PawaPay validate
  if (digits.startsWith(dial)) return digits;
  if (digits.startsWith("0")) digits = digits.slice(1);
  return dial + digits;
}
