-- 057: Native community rooms — replacement for the suspended WhatsApp
-- group (CCB Malawi). One room first ('malawi'); the rooms table is
-- designed for future per-country rooms (CCB Zambia, CCB Kenya, ...) so
-- expanding later needs no migration.

create table if not exists community_rooms (
  id text primary key,              -- slug: 'malawi', 'zambia', ...
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists community_messages (
  id bigint generated always as identity primary key,
  room text not null default 'malawi' references community_rooms(id),
  user_id uuid not null,
  username text not null,
  avatar_url text,
  body text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Newest-first scan for pagination (room + id cursor)
create index if not exists community_messages_room_idx
  on community_messages (room, id desc);
-- Rate-limit check (user's most recent message)
create index if not exists community_messages_user_recent_idx
  on community_messages (user_id, created_at desc);

-- RLS: authenticated read (needed for realtime postgres_changes); all
-- writes go through the API routes with the service role.
alter table community_rooms enable row level security;
drop policy if exists "read_community_rooms" on community_rooms;
create policy "read_community_rooms" on community_rooms
  for select to authenticated using (true);

alter table community_messages enable row level security;
drop policy if exists "read_community_messages" on community_messages;
create policy "read_community_messages" on community_messages
  for select to authenticated using (true);

-- Realtime delivery for the chat page
alter publication supabase_realtime add table community_messages;

-- Seed the first room
insert into community_rooms (id, name)
values ('malawi', 'Crazy Chess Battles Malawi')
on conflict (id) do nothing;
