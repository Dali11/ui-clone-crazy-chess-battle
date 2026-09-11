-- 058: Chats — country-gated rooms + Global room + direct messages.
-- "Chats" replaces Live in the bottom nav; groups pinned by default;
-- Malawi players see only Malawi + Global groups (same pattern for every
-- country when we expand). DMs between players, WhatsApp-style.

-- Rooms get a country (ISO-3166 alpha-2). NULL country = global room,
-- visible to everyone. Per-country rooms are visible only to players
-- whose profile country matches.
alter table community_rooms add column if not exists country text;
update community_rooms set country = 'MW' where id = 'malawi';
insert into community_rooms (id, name, country)
values ('global', 'Crazy Chess Battles Global', null)
on conflict (id) do nothing;

-- Enforce the gate at the row level too (covers both API reads and
-- realtime postgres_changes delivery — foreign-country rooms are
-- invisible even if someone guesses the slug).
drop policy if exists "read_community_messages" on community_messages;
create policy "read_community_messages" on community_messages
  for select to authenticated using (
    exists (
      select 1 from community_rooms r
      where r.id = room
        and (r.country is null
             or r.country = (select country from profiles where id = auth.uid()))
    )
  );

-- Direct messages between two players
create table if not exists direct_messages (
  id bigint generated always as identity primary key,
  sender_id uuid not null references profiles(id),
  recipient_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  deleted_at timestamptz,
  constraint dm_not_self check (sender_id <> recipient_id)
);

-- Pair scan for conversation pagination
create index if not exists direct_messages_pair_idx
  on direct_messages (
    least(sender_id, recipient_id),
    greatest(sender_id, recipient_id),
    id desc
  );
-- Unread badge scan
create index if not exists direct_messages_unread_idx
  on direct_messages (recipient_id, id desc)
  where read_at is null and deleted_at is null;

-- RLS: only the two participants can ever read a DM (API + realtime).
-- All writes go through the API routes with the service role.
alter table direct_messages enable row level security;
drop policy if exists "participants_read_dms" on direct_messages;
create policy "participants_read_dms" on direct_messages
  for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- Live delivery
alter publication supabase_realtime add table direct_messages;
