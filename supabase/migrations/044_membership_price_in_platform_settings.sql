-- ============================================================
-- 044_membership_price_in_platform_settings.sql
-- Move membership pricing from market_config to platform_settings
-- so admins can configure it from the platform settings panel.
-- ============================================================

-- Update the membership section config with price fields
UPDATE public.platform_settings
SET config = config || jsonb_build_object(
  'monthly_price', 10000,
  'yearly_price', 100000,
  'currency', 'MWK',
  'membership_active', true
),
  updated_at = now()
WHERE section = 'membership';

-- If the membership row doesn't exist, create it
INSERT INTO public.platform_settings (section, config)
SELECT 'membership', jsonb_build_object(
  'auto_renew', false,
  'grace_period_days', 10,
  'require_verification', false,
  'monthly_price', 10000,
  'yearly_price', 100000,
  'currency', 'MWK',
  'membership_active', true,
  'show_kpi_cards', true,
  'page_size', 20
)
WHERE NOT EXISTS (
  SELECT 1 FROM public.platform_settings WHERE section = 'membership'
);
