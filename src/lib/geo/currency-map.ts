// ISO 3166-1 alpha-2 country code -> ISO 4217 currency code.
// Used to determine which currency to display prices in based on
// the visitor's detected country. Falls back to MWK if unknown.
export const COUNTRY_CURRENCY: Record<string, string> = {
  MW: "MWK", US: "USD", GB: "GBP", ZA: "ZAR", KE: "KES", TZ: "TZS",
  ZM: "ZMW", ZW: "ZWL", MZ: "MZN", UG: "UGX", RW: "RWF", BW: "BWP",
  NA: "NAD", NG: "NGN", GH: "GHS", EG: "EGP", MA: "MAD", DZ: "DZD",
  TN: "TND", ET: "ETB", CI: "XOF", SN: "XOF", ML: "XOF", CM: "XAF",
  CD: "CDF", AO: "AOA", MG: "MGA", MU: "MUR", SC: "SCR", SZ: "SZL",
  LS: "LSL", CA: "CAD", MX: "MXN", BR: "BRL", AR: "ARS", CL: "CLP",
  CO: "COP", PE: "PEN", DE: "EUR", FR: "EUR", IT: "EUR", ES: "EUR",
  PT: "EUR", NL: "EUR", BE: "EUR", IE: "EUR", AT: "EUR", FI: "EUR",
  GR: "EUR", LU: "EUR", MT: "EUR", CY: "EUR", SK: "EUR", SI: "EUR",
  EE: "EUR", LV: "EUR", LT: "EUR", HR: "EUR", CH: "CHF", NO: "NOK",
  SE: "SEK", DK: "DKK", IS: "ISK", PL: "PLN", CZ: "CZK", HU: "HUF",
  RO: "RON", BG: "BGN", RS: "RSD", UA: "UAH", RU: "RUB", TR: "TRY",
  IL: "ILS", SA: "SAR", AE: "AED", QA: "QAR", KW: "KWD", BH: "BHD",
  OM: "OMR", JO: "JOD", LB: "LBP", IQ: "IQD", IR: "IRR", PK: "PKR",
  IN: "INR", BD: "BDT", LK: "LKR", NP: "NPR", CN: "CNY", HK: "HKD",
  TW: "TWD", JP: "JPY", KR: "KRW", SG: "SGD", MY: "MYR", TH: "THB",
  VN: "VND", PH: "PHP", ID: "IDR", AU: "AUD", NZ: "NZD", FJ: "FJD",
};

export const DEFAULT_CURRENCY = "MWK";

export function currencyForCountry(countryCode: string): string {
  return COUNTRY_CURRENCY[countryCode?.toUpperCase()] || DEFAULT_CURRENCY;
}
