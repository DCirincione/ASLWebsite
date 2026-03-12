create or replace function public.is_admin_or_owner()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'owner')
  );
$$;

revoke all on function public.is_admin_or_owner() from public;
grant execute on function public.is_admin_or_owner() to authenticated;

alter table public.events enable row level security;

drop policy if exists "Admin insert events" on public.events;
create policy "Admin insert events"
on public.events
for insert
to authenticated
with check (public.is_admin_or_owner());

drop policy if exists "Admin update events" on public.events;
create policy "Admin update events"
on public.events
for update
to authenticated
using (public.is_admin_or_owner())
with check (public.is_admin_or_owner());

drop policy if exists "Admin delete events" on public.events;
create policy "Admin delete events"
on public.events
for delete
to authenticated
using (public.is_admin_or_owner());
