alter table public.profiles
add column if not exists suspended boolean not null default false,
add column if not exists suspended_at timestamptz,
add column if not exists suspension_reason text;

alter table public.profiles enable row level security;

drop policy if exists "Admin read profiles" on public.profiles;
create policy "Admin read profiles"
on public.profiles
for select
to authenticated
using (public.is_admin_or_owner());

drop policy if exists "Admin update profiles" on public.profiles;
create policy "Admin update profiles"
on public.profiles
for update
to authenticated
using (public.is_admin_or_owner())
with check (public.is_admin_or_owner());
