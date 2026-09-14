-- 075: Audience targeting for self-serve direct ad campaigns.
-- target_country / target_gender are NULL (= everyone) or a concrete
-- slice; /api/ads/active only serves a campaign to matching players.
-- Gender targeting uses the profiles.gender identity field (male/female);
-- players who never set gender only see ungendered campaigns.

alter table ad_campaigns add column if not exists target_country text
  check (target_country is null or target_country ~ '^[A-Z]{2}$');
alter table ad_campaigns add column if not exists target_gender text
  check (target_gender is null or target_gender in ('male', 'female'));

create index if not exists idx_ad_campaigns_targeting
  on ad_campaigns(status, target_country, target_gender);
