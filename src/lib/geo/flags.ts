/**
 * Client-safe country flag emoji lookup.
 *
 * profile.country stores ISO 3166-1 alpha-2 codes (set at signup).
 * Used to show a player's flag next to their name on leaderboards and
 * admin panels. Unknown/missing countries render no flag (empty string),
 * so callers should treat "" as "hide".
 */

export const COUNTRY_FLAGS: Record<string, string> = {
  // Signup country list
  MW: "🇲🇼", ZM: "🇿🇲", KE: "🇰🇪", NG: "🇳🇬", ZA: "🇿🇦", GH: "🇬🇭",
  TZ: "🇹🇿", UG: "🇺🇬", ZW: "🇿🇼", BW: "🇧🇼", NA: "🇳🇦", RW: "🇷🇼",
  CM: "🇨🇲", EG: "🇪🇬", ET: "🇪🇹", MA: "🇲🇦", SN: "🇸🇳",
  // Extra markets seen in production data
  CI: "🇨🇮", CD: "🇨🇩", BJ: "🇧🇯",
};

export function countryFlag(countryCode: string | null | undefined): string {
  if (!countryCode) return "";
  return COUNTRY_FLAGS[countryCode.toUpperCase()] ?? "";
}
