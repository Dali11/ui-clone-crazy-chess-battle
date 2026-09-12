-- 069: Message actions — quoted replies.
-- Denormalized snapshot: immune to the original being unloaded or deleted;
-- the original id is kept so the client can jump/highlight when present.
alter table community_messages
  add column if not exists reply_to_id uuid,
  add column if not exists reply_username text,
  add column if not exists reply_preview text;

alter table direct_messages
  add column if not exists reply_to_id uuid,
  add column if not exists reply_username text,
  add column if not exists reply_preview text;
