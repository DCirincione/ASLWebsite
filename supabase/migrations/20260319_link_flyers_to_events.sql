alter table public.flyers
add column if not exists event_id uuid references public.events (id) on delete cascade;

create unique index if not exists flyers_event_id_uidx
on public.flyers (event_id)
where event_id is not null;

update public.flyers as f
set event_id = e.id
from public.events as e
where f.event_id is null
  and e.registration_program_slug is not null
  and lower(trim(f.flyer_name)) = lower(trim(e.registration_program_slug));

update public.flyers as f
set event_id = e.id
from public.events as e
where f.event_id is null
  and lower(trim(f.flyer_name)) = lower(trim(e.title));

alter table public.flyers
drop column if exists event_photo_url;
