-- 062: Push notifications (WhatsApp-style) — web push subscriptions + throttle log.
-- Players' devices register a push subscription (Web Push API / VAPID).
-- push_log is the per-user/per-key throttle state (e.g. don't re-notify a
-- group room or a game turn more than once per N minutes).

-- One row per device/browser subscription. A user may have several.
create table push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  endpoint text not null unique,          -- push service URL (per device)
  p256dh text not null,                  -- client public key
  auth text not null,                    -- client auth secret
  user_agent text,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_id on push_subscriptions(user_id);

alter table push_subscriptions enable row level security;

-- Players manage only their own subscriptions.
create policy "own subs" on push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Throttle log: one row per (user, notification key) recording the last send.
-- Service-role only (no RLS read policy) — client can't read or write it.
create table push_log (
  user_id uuid not null references profiles(id) on delete cascade,
  notif_key text not null,
  last_sent_at timestamptz not null,
  primary key (user_id, notif_key)
);
