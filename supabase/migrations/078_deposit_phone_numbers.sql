-- Deposit phone numbers: up to 3 numbers per player, used ONLY for deposits /
-- mobile-money payments. Once a player sets these (even just one), they are
-- locked and can only be changed by support/admin — this closes the OTP-spam
-- vector Gordon raised, where a free-text phone field on every deposit call
-- let anyone submit an arbitrary number and trigger an OTP push to it.
--
-- Withdrawals are unaffected: profiles.phone stays free-text, editable by
-- the player, and withdrawals can go to any number.

alter table profiles
  add column if not exists deposit_phone_numbers jsonb not null default '[]'::jsonb;

-- Cap at 3. (Postgres CHECK can't use subqueries, so per-element format
-- validation lives in the trigger below.)
alter table profiles drop constraint if exists deposit_phone_numbers_shape;
alter table profiles add constraint deposit_phone_numbers_shape
  check (
    jsonb_typeof(deposit_phone_numbers) = 'array'
    and jsonb_array_length(deposit_phone_numbers) <= 3
  );

-- Validate entry format and enforce the lock. On INSERT (first save) any
-- entries must be valid phone numbers. On UPDATE, once the player already
-- has at least one number, no change is allowed unless the request runs
-- as service_role (i.e. a support/admin action via the backend's admin
-- client, which bypasses this check).
create or replace function enforce_deposit_phone_lock()
returns trigger as $$
begin
  if new.deposit_phone_numbers is distinct from old.deposit_phone_numbers
     or (tg_op = 'INSERT' and jsonb_array_length(new.deposit_phone_numbers) > 0) then

    if exists (
      select 1
      from jsonb_array_elements_text(new.deposit_phone_numbers) as elem
      where elem !~ '^\+?[0-9]{7,15}$'
    ) then
      raise exception 'Deposit phone numbers must be digits only (7-15 digits, optional leading +).';
    end if;

    if tg_op = 'UPDATE'
       and coalesce(jsonb_array_length(old.deposit_phone_numbers), 0) > 0
       and coalesce(current_setting('request.jwt.claim.role', true), current_setting('role', true)) is distinct from 'service_role' then
      raise exception 'Deposit phone numbers are locked once set. Contact support to change them.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_deposit_phone_lock on profiles;
create trigger trg_enforce_deposit_phone_lock
  before insert or update on profiles
  for each row
  execute function enforce_deposit_phone_lock();
