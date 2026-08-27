/**
 * Market Config — fetches country-specific settings from the database.
 * Nothing about country/currency/pricing is hardcoded in the app.
 */
import { createAdminClient } from '@/lib/supabase/admin';

export interface MarketConfig {
  countryCode: string;
  countryName: string;
  currencyCode: string;
  currencySymbol: string;
  membershipActive: boolean;
  membershipPrice: number;
  membershipCurrency: string;
}

const DEFAULT_CONFIG: MarketConfig = {
  countryCode: 'MW',
  countryName: 'Malawi',
  currencyCode: 'MWK',
  currencySymbol: 'MK',
  membershipActive: true,
  membershipPrice: 1000000, // MK10,000 in cents
  membershipCurrency: 'MWK',
};

/**
 * Fetch the market config for a given country code.
 * Falls back to the default market if the country isn't configured.
 */
export async function getMarketConfig(countryCode?: string | null): Promise<MarketConfig> {
  const supabase = createAdminClient();

  // Try the specific country first
  if (countryCode) {
    const { data } = await supabase
      .from('market_config')
      .select('*')
      .eq('country_code', countryCode)
      .single();

    if (data) {
      return {
        countryCode: data.country_code,
        countryName: data.country_name,
        currencyCode: data.currency_code,
        currencySymbol: data.currency_symbol || data.currency_code,
        membershipActive: data.membership_active,
        membershipPrice: data.membership_price,
        membershipCurrency: data.membership_currency,
      };
    }
  }

  // Fall back to the default market
  const { data: defaultRow } = await supabase
    .from('market_config')
    .select('*')
    .eq('is_default', true)
    .single();

  if (defaultRow) {
    return {
      countryCode: defaultRow.country_code,
      countryName: defaultRow.country_name,
      currencyCode: defaultRow.currency_code,
      currencySymbol: defaultRow.currency_symbol || defaultRow.currency_code,
      membershipActive: defaultRow.membership_active,
      membershipPrice: defaultRow.membership_price,
      membershipCurrency: defaultRow.membership_currency,
    };
  }

  // Ultimate fallback — should never hit this
  return DEFAULT_CONFIG;
}
