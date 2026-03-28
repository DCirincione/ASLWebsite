create extension if not exists pgcrypto;

create table if not exists public.user_direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references public.profiles(id) on delete cascade,
  recipient_user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint user_direct_messages_no_self check (sender_user_id <> recipient_user_id)
);

create index if not exists user_direct_messages_sender_idx
  on public.user_direct_messages (sender_user_id, created_at desc);

create index if not exists user_direct_messages_recipient_idx
  on public.user_direct_messages (recipient_user_id, created_at desc);

alter table public.user_direct_messages enable row level security;

drop policy if exists "Users can read their own direct messages" on public.user_direct_messages;
create policy "Users can read their own direct messages"
  on public.user_direct_messages
  for select
  using (auth.uid() = sender_user_id or auth.uid() = recipient_user_id);

drop policy if exists "Users can send direct messages" on public.user_direct_messages;
create policy "Users can send direct messages"
  on public.user_direct_messages
  for insert
  with check (auth.uid() = sender_user_id);

drop policy if exists "Recipients can mark direct messages as read" on public.user_direct_messages;
create policy "Recipients can mark direct messages as read"
  on public.user_direct_messages
  for update
  using (auth.uid() = recipient_user_id)
  with check (auth.uid() = recipient_user_id);
