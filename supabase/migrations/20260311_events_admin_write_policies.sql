alter table public.events enable row level security;

drop policy if exists "Admin insert events" on public.events;
create policy "Admin insert events"
on public.events
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'owner')
  )
);

drop policy if exists "Admin update events" on public.events;
create policy "Admin update events"
on public.events
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'owner')
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'owner')
  )
);

drop policy if exists "Admin delete events" on public.events;
create policy "Admin delete events"
on public.events
for delete
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'owner')
  )
);
