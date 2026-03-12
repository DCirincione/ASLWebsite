create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create index if not exists contact_messages_created_at_idx
on public.contact_messages (created_at desc);

alter table public.contact_messages enable row level security;

-- Allow anyone (including guests) to submit a contact message.
drop policy if exists "Public insert contact messages" on public.contact_messages;
create policy "Public insert contact messages"
on public.contact_messages
for insert
to public
with check (true);

-- Only admins/owners can read contact submissions in dashboard.
drop policy if exists "Admin read contact messages" on public.contact_messages;
create policy "Admin read contact messages"
on public.contact_messages
for select
to authenticated
using (public.is_admin_or_owner());
