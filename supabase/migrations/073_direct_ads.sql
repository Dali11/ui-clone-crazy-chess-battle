-- 073_direct_ads.sql — Self-serve direct advertising (replaces Adsterra)
-- Advertisers buy flat-rate weekly banner campaigns from their wallet;
-- admin approves; campaigns serve in every AdSlot placement and expire
-- automatically at ends_at.

create table if not exists ad_campaigns (
  id uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references profiles(id) on delete cascade,
  business_name text not null check (char_length(business_name) between 1 and 60),
  headline text not null check (char_length(headline) between 1 and 60),
  body text check (body is null or char_length(body) <= 120),
  image_url text,
  target_url text not null,
  weeks int not null check (weeks in (1, 2, 4)),
  price_mwk int not null check (price_mwk > 0),
  status text not null default 'pending_review'
    check (status in ('pending_review','active','rejected','paused','ended','refunded')),
  starts_at timestamptz,
  ends_at timestamptz,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  reject_reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_ad_campaigns_status_live
  on ad_campaigns (status, starts_at, ends_at);
create index if not exists idx_ad_campaigns_advertiser
  on ad_campaigns (advertiser_id, created_at desc);

-- Atomic stat increments (impressions/clicks) — no lost-update races.
create or replace function increment_ad_stat(p_campaign uuid, p_kind text)
returns void as $$
begin
  if p_kind = 'impression' then
    update ad_campaigns set impressions = impressions + 1 where id = p_campaign;
  elsif p_kind = 'click' then
    update ad_campaigns set clicks = clicks + 1 where id = p_campaign;
  end if;
end; $$ language plpgsql security definer;

alter table ad_campaigns enable row level security;
-- All access via API routes (service role bypasses RLS); no direct client policies.
