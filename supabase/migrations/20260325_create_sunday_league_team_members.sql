create table if not exists public.sunday_league_team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.sunday_league_teams (id) on delete cascade,
  player_user_id uuid references auth.users (id) on delete set null,
  invite_email text,
  invite_name text,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  source text not null check (source in ('player_request', 'captain_invite')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'sunday_league_team_members_source_check'
      and conrelid = 'public.sunday_league_team_members'::regclass
  ) then
    alter table public.sunday_league_team_members
    add constraint sunday_league_team_members_source_check check (
      (
        source = 'player_request'
        and player_user_id is not null
        and invite_email is null
      )
      or (
        source = 'captain_invite'
        and (
          player_user_id is not null
          or nullif(btrim(coalesce(invite_email, '')), '') is not null
        )
      )
    );
  end if;
end
$$;

create index if not exists sunday_league_team_members_team_id_idx
on public.sunday_league_team_members (team_id);

create index if not exists sunday_league_team_members_player_user_id_idx
on public.sunday_league_team_members (player_user_id);

create index if not exists sunday_league_team_members_invite_email_idx
on public.sunday_league_team_members (lower(invite_email));

create unique index if not exists sunday_league_team_members_team_player_unique
on public.sunday_league_team_members (team_id, player_user_id)
where player_user_id is not null;

create unique index if not exists sunday_league_team_members_team_invite_email_unique
on public.sunday_league_team_members (team_id, lower(invite_email))
where invite_email is not null;

create unique index if not exists sunday_league_team_members_player_accepted_unique
on public.sunday_league_team_members (player_user_id)
where player_user_id is not null and status = 'accepted';

drop trigger if exists set_sunday_league_team_members_updated_at on public.sunday_league_team_members;
create trigger set_sunday_league_team_members_updated_at
before update on public.sunday_league_team_members
for each row
execute function public.set_updated_at();

alter table public.sunday_league_team_members enable row level security;

drop policy if exists "Public read accepted sunday league team members" on public.sunday_league_team_members;
create policy "Public read accepted sunday league team members"
on public.sunday_league_team_members
for select
using (status = 'accepted');

drop policy if exists "Captains read own sunday league team members" on public.sunday_league_team_members;
create policy "Captains read own sunday league team members"
on public.sunday_league_team_members
for select
to authenticated
using (
  exists (
    select 1
    from public.sunday_league_teams team
    where team.id = sunday_league_team_members.team_id
      and team.user_id = auth.uid()
  )
);

drop policy if exists "Players read own sunday league team members" on public.sunday_league_team_members;
create policy "Players read own sunday league team members"
on public.sunday_league_team_members
for select
to authenticated
using (
  player_user_id = auth.uid()
  or lower(coalesce(invite_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists "Players insert own sunday league join requests" on public.sunday_league_team_members;
create policy "Players insert own sunday league join requests"
on public.sunday_league_team_members
for insert
to authenticated
with check (
  source = 'player_request'
  and status = 'pending'
  and player_user_id = auth.uid()
  and invite_email is null
  and exists (
    select 1
    from public.sunday_league_teams team
    where team.id = sunday_league_team_members.team_id
      and team.user_id <> auth.uid()
  )
);

drop policy if exists "Captains insert sunday league team invites" on public.sunday_league_team_members;
create policy "Captains insert sunday league team invites"
on public.sunday_league_team_members
for insert
to authenticated
with check (
  source = 'captain_invite'
  and status = 'pending'
  and exists (
    select 1
    from public.sunday_league_teams team
    where team.id = sunday_league_team_members.team_id
      and team.user_id = auth.uid()
  )
);

drop policy if exists "Captains update own sunday league team members" on public.sunday_league_team_members;
create policy "Captains update own sunday league team members"
on public.sunday_league_team_members
for update
to authenticated
using (
  exists (
    select 1
    from public.sunday_league_teams team
    where team.id = sunday_league_team_members.team_id
      and team.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.sunday_league_teams team
    where team.id = sunday_league_team_members.team_id
      and team.user_id = auth.uid()
  )
);

drop policy if exists "Players respond to own sunday league invites" on public.sunday_league_team_members;
create policy "Players respond to own sunday league invites"
on public.sunday_league_team_members
for update
to authenticated
using (
  source = 'captain_invite'
  and status = 'pending'
  and (
    player_user_id = auth.uid()
    or lower(coalesce(invite_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
)
with check (
  source = 'captain_invite'
  and player_user_id = auth.uid()
);
