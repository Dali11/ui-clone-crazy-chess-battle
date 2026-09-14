-- 074: Advertiser banner uploads (self-serve direct ads).
-- image_url on ad_campaigns can point at a Supabase Storage object in the
-- public 'ad-creatives' bucket (unguessable UUID paths). Advertisers upload
-- from the /advertise form; images render ratio-aware (object-contain).

insert into storage.buckets (id, name, public)
values ('ad-creatives', 'ad-creatives', true)
on conflict (id) do nothing;

drop policy if exists "players upload ad creatives" on storage.objects;
create policy "players upload ad creatives" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'ad-creatives');

drop policy if exists "ad creatives are readable" on storage.objects;
create policy "ad creatives are readable" on storage.objects
  for select
  using (bucket_id = 'ad-creatives');
