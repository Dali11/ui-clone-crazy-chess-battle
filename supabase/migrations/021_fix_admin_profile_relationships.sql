-- The admin API embeds profiles into deposits/withdrawals via PostgREST
-- (e.g. `.select("...profiles!inner(username, display_name, email)")`).
-- PostgREST can only auto-resolve that embed if there's a direct FK
-- between the two tables being joined. Both tables only had a FK to
-- auth.users(id), not profiles(id), so the embed silently failed and
-- the admin Deposits/Withdrawals tabs always rendered empty.
--
-- Fix: add direct FKs from user_id -> profiles(id) on both tables.
-- (profiles.id == auth.users.id 1:1 in this schema, so this is safe;
-- Postgres allows multiple FKs on the same column to different tables.)

alter table deposits
  add constraint deposits_user_id_profiles_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

alter table withdrawals
  add constraint withdrawals_user_id_profiles_fkey
  foreign key (user_id) references profiles(id) on delete cascade;

-- withdrawals now has two FKs to profiles (user_id and processed_by),
-- so any embed of profiles on withdrawals must disambiguate with
-- profiles!withdrawals_user_id_profiles_fkey(...) in the app code.

notify pgrst, 'reload schema';
