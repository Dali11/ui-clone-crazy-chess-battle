-- 068: Admin-configurable icons for community rooms.
-- NULL = platform logo (rendered as the default by the UI).
alter table community_rooms
  add column if not exists image_url text;
