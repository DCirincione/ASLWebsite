alter table public.contact_messages
add column if not exists is_read boolean not null default false,
add column if not exists read_at timestamptz;

create index if not exists contact_messages_is_read_created_at_idx
on public.contact_messages (is_read, created_at desc);
