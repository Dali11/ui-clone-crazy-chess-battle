-- 077: KYC document verification (national ID / passport / driver's licence).
-- Compliance commitment to PawaPay (call 2026-09-15): players submit a
-- government ID + selfie; admins review and flip profiles.identity_verified.
-- Documents live in a PRIVATE storage bucket — only signed URLs generated
-- server-side by the admin client can fetch them.

-- Private bucket
insert into storage.buckets (id, name, public)
values ('kyc-documents', 'kyc-documents', false)
on conflict (id) do nothing;

-- Players can upload into their own folder only
drop policy if exists "players upload own kyc docs" on storage.objects;
create policy "players upload own kyc docs" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'kyc-documents' and (storage.foldername(name))[1] = auth.uid()::text);

-- Nobody reads via RLS — admins fetch via service-role signed URLs only
drop policy if exists "no public read of kyc docs" on storage.objects;
create policy "no public read of kyc docs" on storage.objects
  for select to authenticated
  using (false);

-- Submissions table
create table if not exists public.kyc_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('national_id', 'passport', 'drivers_license')),
  doc_number TEXT NOT NULL,
  doc_path TEXT NOT NULL,
  selfie_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

create index if not exists idx_kyc_submissions_status on public.kyc_submissions (status, created_at desc);
create index if not exists idx_kyc_submissions_user on public.kyc_submissions (user_id);

alter table public.kyc_submissions enable row level security;

-- Players see their own submissions; can create new ones. Only the service
-- role (admin client) can update status/review fields.
drop policy if exists "players read own kyc submissions" on public.kyc_submissions;
create policy "players read own kyc submissions" on public.kyc_submissions
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "players create own kyc submissions" on public.kyc_submissions;
create policy "players create own kyc submissions" on public.kyc_submissions
  for insert to authenticated with check (user_id = auth.uid());
