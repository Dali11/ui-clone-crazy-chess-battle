-- 070: fix 069 — message ids on BOTH chat tables are bigint, not uuid.
alter table community_messages drop column if exists reply_to_id;
alter table community_messages add column if not exists reply_to_id bigint;
alter table direct_messages drop column if exists reply_to_id;
alter table direct_messages add column if not exists reply_to_id bigint;
