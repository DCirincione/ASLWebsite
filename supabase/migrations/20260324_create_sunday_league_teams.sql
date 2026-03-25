create table if not exists public.sunday_league_teams (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  division integer not null check (division in (1, 2)),
  slot_number integer not null check (slot_number between 1 and 10),
  captain_name text not null,
  captain_phone text not null,
  captain_email text not null,
  captain_is_playing boolean not null default true,
  team_name text not null,
  preferred_jersey_colors jsonb not null default '{}'::jsonb,
  preferred_jersey_design text,
  team_logo_url text,
  logo_description text,
  jersey_numbers text[] not null default '{}',
  agreements jsonb not null default '{}'::jsonb,
  deposit_status text not null default 'pending' check (deposit_status in ('pending', 'paid')),
  team_status text not null default 'pending' check (team_status in ('pending', 'approved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (division, slot_number)
);

create index if not exists sunday_league_teams_user_id_idx
on public.sunday_league_teams (user_id);

create index if not exists sunday_league_teams_division_idx
on public.sunday_league_teams (division, slot_number);

drop trigger if exists set_sunday_league_teams_updated_at on public.sunday_league_teams;
create trigger set_sunday_league_teams_updated_at
before update on public.sunday_league_teams
for each row
execute function public.set_updated_at();

alter table public.sunday_league_teams enable row level security;

drop policy if exists "Public read sunday league teams" on public.sunday_league_teams;
create policy "Public read sunday league teams"
on public.sunday_league_teams
for select
using (true);

drop policy if exists "Users insert own sunday league team" on public.sunday_league_teams;
create policy "Users insert own sunday league team"
on public.sunday_league_teams
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users update own sunday league team" on public.sunday_league_teams;
create policy "Users update own sunday league team"
on public.sunday_league_teams
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Admins update sunday league teams" on public.sunday_league_teams;
create policy "Admins update sunday league teams"
on public.sunday_league_teams
for update
to authenticated
using (public.is_admin_or_owner())
with check (public.is_admin_or_owner());

drop policy if exists "Admins delete sunday league teams" on public.sunday_league_teams;
create policy "Admins delete sunday league teams"
on public.sunday_league_teams
for delete
to authenticated
using (public.is_admin_or_owner());
