create table if not exists public.sunday_league_schedule_weeks (
  id uuid primary key default gen_random_uuid(),
  week_number integer not null unique check (week_number > 0),
  black_sheep_field_schedule text not null,
  magic_fountain_field_schedule text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sunday_league_schedule_weeks_week_number_idx
on public.sunday_league_schedule_weeks (week_number asc);

drop trigger if exists set_sunday_league_schedule_weeks_updated_at on public.sunday_league_schedule_weeks;
create trigger set_sunday_league_schedule_weeks_updated_at
before update on public.sunday_league_schedule_weeks
for each row
execute function public.set_updated_at();

alter table public.sunday_league_schedule_weeks enable row level security;

drop policy if exists "Public read sunday league schedule weeks" on public.sunday_league_schedule_weeks;
create policy "Public read sunday league schedule weeks"
on public.sunday_league_schedule_weeks
for select
using (true);

drop policy if exists "Admins insert sunday league schedule weeks" on public.sunday_league_schedule_weeks;
create policy "Admins insert sunday league schedule weeks"
on public.sunday_league_schedule_weeks
for insert
to authenticated
with check (public.is_admin_or_owner());

drop policy if exists "Admins update sunday league schedule weeks" on public.sunday_league_schedule_weeks;
create policy "Admins update sunday league schedule weeks"
on public.sunday_league_schedule_weeks
for update
to authenticated
using (public.is_admin_or_owner())
with check (public.is_admin_or_owner());

drop policy if exists "Admins delete sunday league schedule weeks" on public.sunday_league_schedule_weeks;
create policy "Admins delete sunday league schedule weeks"
on public.sunday_league_schedule_weeks
for delete
to authenticated
using (public.is_admin_or_owner());
