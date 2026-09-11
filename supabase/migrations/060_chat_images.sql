-- 060: Image uploads in chats (groups + DMs).
-- image_url points at a Supabase Storage object in the public 'chat-images'
-- bucket (unguessable UUID paths). Optional caption lives in body.

alter table community_messages add column if not exists image_url text;
alter table direct_messages add column if not exists image_url text;

-- Storage: public-read bucket, uploads restricted to signed-in players.
insert into storage.buckets (id, name, public)
values ('chat-images', 'chat-images', true)
on conflict (id) do nothing;

drop policy if exists "players upload chat images" on storage.objects;
create policy "players upload chat images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-images');

drop policy if exists "chat images are readable" on storage.objects;
create policy "chat images are readable" on storage.objects
  for select
  using (bucket_id = 'chat-images');
