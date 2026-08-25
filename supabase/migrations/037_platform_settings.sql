-- Migration 037: Platform Settings Table
-- A flexible key-value settings store for per-section admin configuration.
-- Each row = one setting group (e.g. 'deposits', 'battles', 'games').
-- The 'config' JSONB column holds all settings for that group.

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section TEXT NOT NULL UNIQUE,          -- e.g. 'deposits', 'battles', 'games'
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id)
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage platform settings" ON public.platform_settings;
CREATE POLICY "Admins manage platform settings" ON public.platform_settings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));

-- Seed default settings for each section
INSERT INTO public.platform_settings (section, config) VALUES
  ('deposits', '{"enabled": true, "auto_credit": false, "min_amount_cents": 500, "max_amount_cents": 10000000, "allowed_methods": ["mpesa", "airtel", "card"], "require_approval_above_cents": 50000, "show_kpi_cards": true, "default_filter": "pending", "page_size": 20}'::jsonb),
  ('withdrawals', '{"enabled": true, "auto_approve": false, "min_amount_cents": 1000, "max_amount_cents": 5000000, "daily_limit_cents": 1000000, "processing_fee_pct": 0, "withdrawal_fee_cents": 0, "show_kpi_cards": true, "default_filter": "pending", "page_size": 20}'::jsonb),
  ('battles', '{"enabled": true, "min_stake_cents": 100, "max_stake_cents": 1000000, "platform_fee_pct": 10, "auto_cancel_minutes": 10, "show_kpi_cards": true, "page_size": 20}'::jsonb),
  ('games', '{"show_kpi_cards": true, "default_filter": "all", "page_size": 20, "allow_spectators": true, "max_concurrent_games": 5}'::jsonb),
  ('users', '{"allow_signup": true, "require_email_verification": false, "default_is_admin": false, "page_size": 20, "show_kpi_cards": true}'::jsonb),
  ('tournaments', '{"require_approval": true, "auto_approve_below_players": 0, "max_players": 128, "page_size": 20, "show_kpi_cards": true}'::jsonb),
  ('berry', '{"berries_per_win": 10, "berries_per_draw": 5, "berries_per_tournament_win": 50, "daily_cap": 100, "conversion_rate": 100, "show_kpi_cards": true}'::jsonb),
  ('leagues', '{"require_membership": true, "auto_relegate": true, "promotion_spots": 5, "relegation_spots": 5, "page_size": 20, "show_kpi_cards": true}'::jsonb),
  ('seasons', '{"auto_create": false, "default_duration_weeks": 12, "allow_overlap": false, "page_size": 20, "show_kpi_cards": true}'::jsonb),
  ('membership', '{"auto_renew": false, "grace_period_days": 10, "require_verification": false, "page_size": 20, "show_kpi_cards": true}'::jsonb),
  ('verification', '{"require_id_document": true, "require_selfie": false, "auto_approve_trusted": false, "page_size": 20, "show_kpi_cards": true}'::jsonb),
  ('logs', '{"retention_days": 90, "page_size": 50, "show_kpi_cards": true}'::jsonb),
  ('overview', '{"show_kpi_cards": true, "refresh_interval_seconds": 30}'::jsonb)
ON CONFLICT (section) DO NOTHING;
