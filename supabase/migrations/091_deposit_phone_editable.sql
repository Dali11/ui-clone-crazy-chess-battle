-- Migration 091: Let players edit their deposit phone numbers in Settings.
--
-- 078 locked the list once set (anti OTP-spam, raised by Gordon). Owner
-- directive 2026-09-21: players should be able to change their number in
-- Settings — not locked. The OTP-spam guard stays in the payment routes:
-- deposits still only go to numbers on the saved list; the list itself is
-- now editable by the player. Format validation and the max-3 cap remain.

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
  end if;
  return new;
end;
$$ language plpgsql;
