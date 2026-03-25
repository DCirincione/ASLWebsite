create table if not exists public.sunday_league_leaderboard (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references public.sunday_league_teams (id) on delete cascade,
  wins integer not null default 0 check (wins >= 0),
  draws integer not null default 0 check (draws >= 0),
  losses integer not null default 0 check (losses >= 0),
  goals_for integer not null default 0 check (goals_for >= 0),
  goals_against integer not null default 0 check (goals_against >= 0),
  goal_distribution text generated always as ((goals_for::text || '-'::text) || goals_against::text) stored,
  points integer generated always as ((wins * 3) + draws) stored,
  games_played integer generated always as ((wins + draws) + losses) stored,
  forfeit_wins integer not null default 0 check (forfeit_wins >= 0 and forfeit_wins <= wins),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists sunday_league_leaderboard_team_id_idx
on public.sunday_league_leaderboard (team_id);

create index if not exists sunday_league_leaderboard_points_idx
on public.sunday_league_leaderboard (points desc, goals_for desc, goals_against asc);

create or replace function public.create_sunday_league_leaderboard_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.sunday_league_leaderboard (team_id)
  values (new.id)
  on conflict (team_id) do nothing;

  return new;
end;
$$;

insert into public.sunday_league_leaderboard (team_id)
select team.id
from public.sunday_league_teams as team
on conflict (team_id) do nothing;

drop trigger if exists create_sunday_league_leaderboard_row on public.sunday_league_teams;
create trigger create_sunday_league_leaderboard_row
after insert on public.sunday_league_teams
for each row
execute function public.create_sunday_league_leaderboard_row();

drop trigger if exists set_sunday_league_leaderboard_updated_at on public.sunday_league_leaderboard;
create trigger set_sunday_league_leaderboard_updated_at
before update on public.sunday_league_leaderboard
for each row
execute function public.set_updated_at();

alter table public.sunday_league_leaderboard enable row level security;

drop policy if exists "Public read sunday league leaderboard" on public.sunday_league_leaderboard;
create policy "Public read sunday league leaderboard"
on public.sunday_league_leaderboard
for select
using (true);

drop policy if exists "Admins insert sunday league leaderboard" on public.sunday_league_leaderboard;
create policy "Admins insert sunday league leaderboard"
on public.sunday_league_leaderboard
for insert
to authenticated
with check (public.is_admin_or_owner());

drop policy if exists "Admins update sunday league leaderboard" on public.sunday_league_leaderboard;
create policy "Admins update sunday league leaderboard"
on public.sunday_league_leaderboard
for update
to authenticated
using (public.is_admin_or_owner())
with check (public.is_admin_or_owner());

drop policy if exists "Admins delete sunday league leaderboard" on public.sunday_league_leaderboard;
create policy "Admins delete sunday league leaderboard"
on public.sunday_league_leaderboard
for delete
to authenticated
using (public.is_admin_or_owner());
