-- Chess Academy — member-only training content. Progress tracking table.
--
-- The Academy is a membership benefit: lessons live in code (versioned with
-- the app, no CMS needed), and each player's completion state lives here.
-- A player can mark a lesson complete only while their membership is active
-- (API-level check), but completed lessons stay visible forever — your
-- study history is yours.

create table if not exists academy_progress (
  user_id uuid not null references profiles(id) on delete cascade,
  lesson_id text not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

alter table academy_progress enable row level security;

-- Players can see and manage only their own progress.
drop policy if exists "academy_progress_own_select" on academy_progress;
create policy "academy_progress_own_select"
  on academy_progress for select
  using (auth.uid() = user_id);

drop policy if exists "academy_progress_own_insert" on academy_progress;
create policy "academy_progress_own_insert"
  on academy_progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "academy_progress_own_delete" on academy_progress;
create policy "academy_progress_own_delete"
  on academy_progress for delete
  using (auth.uid() = user_id);

-- Index for the profile progress query.
create index if not exists academy_progress_user_idx on academy_progress (user_id);
