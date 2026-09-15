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
