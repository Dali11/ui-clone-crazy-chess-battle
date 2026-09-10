-- 053: Monthly XP League championship
-- Runs in parallel with the weekly ladder: same tiers, same XP events,
-- but the leaderboard window is the calendar month (1st 00:00 CAT).
-- Tiers only move on the weekly settle; the monthly cycle is purely a
-- championship with its own rewards — settled on the 1st of each month.

-- Monthly settlement history: final snapshot per closed month
create table if not exists league_xp_monthly_history (
  id uuid primary key default gen_random_uuid(),
  month date not null,                       -- first day of the closed month
  tier smallint not null check (tier between 1 and 5),
  user_id uuid not null references profiles(id) on delete cascade,
  display_name text,
  final_rank smallint not null,
  final_xp integer not null,
  reward_mwk numeric not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists league_xp_monthly_history_month_idx
  on league_xp_monthly_history (month, tier, final_rank);
-- Idempotency: one snapshot row per player per month per tier
create unique index if not exists league_xp_monthly_history_unique
  on league_xp_monthly_history (month, tier, user_id);

alter table league_xp_monthly_history enable row level security;
drop policy if exists "read_league_xp_monthly_history" on league_xp_monthly_history;
create policy "read_league_xp_monthly_history"
  on league_xp_monthly_history
  for select to authenticated using (true);

-- Merge monthly defaults into the existing leagues_xp config
insert into platform_settings (section, config)
values ('leagues_xp', '{
  "monthly_rewards_enabled": true,
  "monthly_top_count": 5,
  "monthly_rewards_t1_mwk": [8000, 4000, 2000, 1000, 500],
  "monthly_rewards_t2_mwk": [12000, 6000, 3000, 1600, 600],
  "monthly_rewards_t3_mwk": [20000, 10000, 5000, 2400, 1000],
  "monthly_rewards_t4_mwk": [32000, 16000, 8000, 4000, 1600],
  "monthly_rewards_t5_mwk": [60000, 32000, 16000, 8000, 4000]
}'::jsonb)
on conflict (section) do update
set config = platform_settings.config || excluded.config;
