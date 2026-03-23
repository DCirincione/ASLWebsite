drop policy if exists "Admin update contact messages" on public.contact_messages;
create policy "Admin update contact messages"
on public.contact_messages
for update
to authenticated
using (public.is_admin_or_owner())
with check (public.is_admin_or_owner());
