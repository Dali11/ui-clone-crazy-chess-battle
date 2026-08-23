-- Migration 025: Withdrawal config table — admin can toggle auto-approval
-- When auto_approve_enabled = true, withdrawal requests are processed automatically
-- via Paychangu without requiring manual admin approval.

CREATE TABLE IF NOT EXISTS public.withdrawal_config (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auto_approve_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by           UUID REFERENCES public.profiles(id)
);

INSERT INTO public.withdrawal_config (auto_approve_enabled) VALUES (false) ON CONFLICT DO NOTHING;

ALTER TABLE public.withdrawal_config ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read (the request route needs to check the toggle)
CREATE POLICY "Authenticated read withdrawal_config" ON public.withdrawal_config
  FOR SELECT TO authenticated USING (true);

-- Only admins can update
CREATE POLICY "Admins update withdrawal_config" ON public.withdrawal_config
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );
