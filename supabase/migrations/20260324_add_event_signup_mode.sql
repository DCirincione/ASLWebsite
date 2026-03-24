alter table public.events
add column if not exists signup_mode text not null default 'registration';

update public.events
set signup_mode = 'registration'
where signup_mode is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'events_signup_mode_check'
  ) then
    alter table public.events
    add constraint events_signup_mode_check
    check (signup_mode in ('registration', 'waitlist'));
  end if;
end
$$;
