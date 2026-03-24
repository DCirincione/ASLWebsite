drop policy if exists "Users update own event submissions" on public.event_submissions;
create policy "Users update own event submissions"
on public.event_submissions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
