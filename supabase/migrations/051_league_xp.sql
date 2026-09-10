-- 051: Duolingo-style XP Leagues
-- Players are seeded into a tier by Elo, then earn XP from every PvP game
-- (chess + draughts). Weekly standings: top 5 rewarded + promoted,
-- bottom 5 demoted. Reset every Monday 00:00 CAT (cron settles first).

-- Membership: one row per player, current cycle only
create table if not exists league_xp_members (
  user_id uuid primary key references profiles(id) on delete cascade,
  tier smallint not null default 1 check (tier between 1 and 5),
  xp integer not null default 0,
  week_start date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- XP events: audit log; unique guard makes awards idempotent
create table if not exists league_xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  game_kind text not null default 'chess' check (game_kind in ('chess', 'draughts')),
  game_id uuid not null,
  amount smallint not null,
  reason text,
  week_start date not null,
  created_at timestamptz not null default now(),
  unique (user_id, game_kind, game_id)
);
create index if not exists league_xp_events_user_week_idx
  on league_xp_events (user_id, week_start, created_at);

-- Weekly settlement history: final snapshot per week
create table if not exists league_xp_history (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  tier smallint not null check (tier between 1 and 5),
  user_id uuid not null references profiles(id) on delete cascade,
  display_name text,
  final_rank smallint not null,
  final_xp integer not null,
  reward_mwk numeric not null default 0,
  promoted boolean not null default false,
  demoted boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists league_xp_history_week_idx
  on league_xp_history (week_start, tier, final_rank);

-- RLS: authenticated users read standings; writes are service-role
alter table league_xp_members enable row level security;
drop policy if exists "read_league_xp_members" on league_xp_members;
create policy "read_league_xp_members" on league_xp_members
  for select to authenticated using (true);

alter table league_xp_events enable row level security;
drop policy if exists "read_own_league_xp_events" on league_xp_events;
create policy "read_own_league_xp_events" on league_xp_events
  for select to authenticated using (true);

alter table league_xp_history enable row level security;
drop policy if exists "read_league_xp_history" on league_xp_history;
create policy "read_league_xp_history" on league_xp_history
  for select to authenticated using (true);

-- Default config in platform_settings (admin-editable)
insert into platform_settings (section, config)
values ('leagues_xp', '{
  "enabled": true,
  "xp_win": 10,
  "xp_draw": 4,
  "xp_loss": 2,
  "xp_upset_bonus": 2,
  "daily_xp_cap": 100,
  "promote_count": 5,
  "demote_count": 5,
  "rewards_enabled": true,
  "reward_1_mwk": 2000,
  "reward_2_mwk": 1000,
  "reward_3_mwk": 500,
  "reward_4_mwk": 250,
  "reward_5_mwk": 100
}'::jsonb)
on conflict (section) do nothing;
