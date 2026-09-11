-- 059: Voice notes in chats (groups + DMs).
-- audio_url points at a Supabase Storage object in the public 'chat-voice'
-- bucket (unguessable UUID paths); audio_duration is whole seconds.
-- A voice note has body='' — the presence of audio_url marks the message.

alter table community_messages add column if not exists audio_url text;
alter table community_messages add column if not exists audio_duration int;
alter table direct_messages add column if not exists audio_url text;
alter table direct_messages add column if not exists audio_duration int;

-- Storage: public-read bucket, uploads restricted to signed-in players.
insert into storage.buckets (id, name, public)
values ('chat-voice', 'chat-voice', true)
on conflict (id) do nothing;

drop policy if exists "players upload voice notes" on storage.objects;
create policy "players upload voice notes" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-voice');

drop policy if exists "voice notes are readable" on storage.objects;
create policy "voice notes are readable" on storage.objects
  for select
  using (bucket_id = 'chat-voice');
