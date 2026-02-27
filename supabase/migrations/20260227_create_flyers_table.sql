create extension if not exists pgcrypto;

create table if not exists public.flyers (
  id uuid primary key default gen_random_uuid(),
  flyer_name text not null,
  flyer_image_url text,
  event_photo_url text,
  details text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists flyers_flyer_name_idx on public.flyers (flyer_name);

create or replace function public.set_updated_at_flyers()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_set_updated_at_flyers on public.flyers;
create trigger trg_set_updated_at_flyers
before update on public.flyers
for each row
execute procedure public.set_updated_at_flyers();

alter table public.flyers enable row level security;

-- Public read access keeps flyer content available on site pages.
drop policy if exists "Public read flyers" on public.flyers;
create policy "Public read flyers"
on public.flyers
for select
using (true);

-- Authenticated users can manage flyers from future admin tools.
drop policy if exists "Authenticated manage flyers" on public.flyers;
create policy "Authenticated manage flyers"
on public.flyers
for all
to authenticated
using (true)
with check (true);
