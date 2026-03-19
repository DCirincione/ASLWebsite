alter table public.events
add column if not exists registration_enabled boolean not null default false,
add column if not exists registration_schema jsonb,
add column if not exists waiver_url text,
add column if not exists allow_multiple_registrations boolean not null default false,
add column if not exists registration_limit integer;

create table if not exists public.event_submissions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  answers jsonb not null default '{}'::jsonb,
  attachments text[] not null default '{}',
  waiver_accepted boolean not null default false,
  waiver_accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_submissions_event_id_idx
on public.event_submissions (event_id);

create index if not exists event_submissions_user_id_idx
on public.event_submissions (user_id);

create index if not exists event_submissions_created_at_idx
on public.event_submissions (created_at desc);

create index if not exists event_submissions_answers_gin_idx
on public.event_submissions using gin (answers);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_event_submissions_updated_at on public.event_submissions;
create trigger set_event_submissions_updated_at
before update on public.event_submissions
for each row
execute function public.set_updated_at();

alter table public.event_submissions enable row level security;

drop policy if exists "Users insert own event submissions" on public.event_submissions;
create policy "Users insert own event submissions"
on public.event_submissions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users read own event submissions" on public.event_submissions;
create policy "Users read own event submissions"
on public.event_submissions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Admins read event submissions" on public.event_submissions;
create policy "Admins read event submissions"
on public.event_submissions
for select
to authenticated
using (public.is_admin_or_owner());

drop policy if exists "Admins update event submissions" on public.event_submissions;
create policy "Admins update event submissions"
on public.event_submissions
for update
to authenticated
using (public.is_admin_or_owner())
with check (public.is_admin_or_owner());

insert into public.event_submissions (
  event_id,
  user_id,
  name,
  email,
  phone,
  answers,
  attachments,
  waiver_accepted,
  waiver_accepted_at,
  created_at,
  updated_at
)
select
  e.id,
  rs.user_id,
  coalesce(
    nullif(rs.answers ->> 'name', ''),
    nullif(rs.answers ->> 'full_name', ''),
    nullif(p.name, ''),
    'Unknown'
  ) as name,
  coalesce(
    nullif(rs.answers ->> 'email', ''),
    nullif(rs.answers ->> 'guardian_email', ''),
    au.email,
    'unknown@example.com'
  ) as email,
  coalesce(
    nullif(rs.answers ->> 'phone', ''),
    nullif(rs.answers ->> 'phone_number', ''),
    nullif(rs.answers ->> 'guardian_phone', '')
  ) as phone,
  coalesce(rs.answers, '{}'::jsonb) as answers,
  coalesce(rs.attachments, '{}') as attachments,
  coalesce(rs.waiver_accepted, false) as waiver_accepted,
  case
    when coalesce(rs.waiver_accepted, false) then coalesce(rs.created_at, now())
    else null
  end as waiver_accepted_at,
  coalesce(rs.created_at, now()) as created_at,
  coalesce(rs.created_at, now()) as updated_at
from public.registration_submissions rs
join public.registration_programs rp
  on rp.id = rs.program_id
join public.events e
  on e.registration_program_slug = rp.slug
left join public.profiles p
  on p.id = rs.user_id
left join auth.users au
  on au.id = rs.user_id
where not exists (
  select 1
  from public.event_submissions es
  where es.event_id = e.id
    and es.user_id = rs.user_id
    and es.created_at = coalesce(rs.created_at, now())
);
