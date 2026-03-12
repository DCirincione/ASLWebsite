alter table public.profiles
add column if not exists role text not null default 'player';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
    add constraint profiles_role_check
    check (role in ('player', 'admin', 'owner'));
  end if;
end $$;
