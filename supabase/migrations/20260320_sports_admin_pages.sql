alter table public.sports
add column if not exists players_per_team integer,
add column if not exists gender text,
add column if not exists short_description text,
add column if not exists section_headers jsonb not null default '[]'::jsonb,
add column if not exists image_url text;

alter table public.sports enable row level security;

drop policy if exists "Public read sports" on public.sports;
create policy "Public read sports"
on public.sports
for select
using (true);

drop policy if exists "Admin insert sports" on public.sports;
create policy "Admin insert sports"
on public.sports
for insert
to authenticated
with check (public.is_admin_or_owner());

drop policy if exists "Admin update sports" on public.sports;
create policy "Admin update sports"
on public.sports
for update
to authenticated
using (public.is_admin_or_owner())
with check (public.is_admin_or_owner());

drop policy if exists "Admin delete sports" on public.sports;
create policy "Admin delete sports"
on public.sports
for delete
to authenticated
using (public.is_admin_or_owner());
