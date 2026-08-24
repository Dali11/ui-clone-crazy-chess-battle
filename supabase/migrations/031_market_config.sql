-- ============================================================
-- Market Config — configurable per-country settings
-- (currency, membership pricing, market name) so nothing about
-- country/currency/pricing is hardcoded in application code.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.market_config (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code          TEXT NOT NULL UNIQUE,          -- ISO 3166-1 alpha-2, e.g. 'MW'
  country_name          TEXT NOT NULL,
  currency_code         TEXT NOT NULL,                 -- ISO 4217, e.g. 'MWK'
  currency_symbol       TEXT NOT NULL DEFAULT '',       -- display symbol/prefix, e.g. 'MK' (blank = use code)
  membership_active      BOOLEAN NOT NULL DEFAULT true,
  membership_price_cents INT NOT NULL DEFAULT 0,        -- monthly price in minor units (cents)
  membership_currency    TEXT NOT NULL,                 -- usually same as currency_code
  is_default             BOOLEAN NOT NULL DEFAULT false, -- fallback market when country can't be resolved
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_config_country ON public.market_config(country_code);

ALTER TABLE public.market_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Market config is public" ON public.market_config FOR SELECT USING (true);
CREATE POLICY "Admins can manage market config" ON public.market_config FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
);

-- Default market: Malawi / MWK. This is configuration, not seed *data* for
-- competitive entities — every country using the platform needs exactly one
-- market_config row to know its currency and membership price.
INSERT INTO public.market_config (country_code, country_name, currency_code, currency_symbol, membership_active, membership_price_cents, membership_currency, is_default)
VALUES ('MW', 'Malawi', 'MWK', 'MK', true, 500000, 'MWK', true)
ON CONFLICT (country_code) DO NOTHING;
