-- Minimal production direction for the mini ATS.
-- Run in Supabase SQL editor after checking existing table names/columns.

create or replace function public.current_user_role()
returns text
language sql
stable
as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    auth.jwt() -> 'user_metadata' ->> 'role',
    'customer'
  );
$$;

alter table public.jobs
  add column if not exists owner_id uuid references auth.users(id);

alter table public.candidates
  add column if not exists owner_id uuid references auth.users(id);

alter table public.jobs
  alter column owner_id set default auth.uid();

alter table public.candidates
  alter column owner_id set default auth.uid();

update public.jobs
set owner_id = auth.uid()
where owner_id is null;

update public.candidates
set owner_id = auth.uid()
where owner_id is null;

alter table public.jobs enable row level security;
alter table public.candidates enable row level security;

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
on public.profiles for select
to authenticated
using (
  id = auth.uid()
  or user_id = auth.uid()
  or email = auth.jwt() ->> 'email'
  or public.current_user_role() = 'admin'
);

drop policy if exists "jobs_select_own_or_admin" on public.jobs;
create policy "jobs_select_own_or_admin"
on public.jobs for select
to authenticated
using (owner_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "jobs_insert_own_or_admin" on public.jobs;
create policy "jobs_insert_own_or_admin"
on public.jobs for insert
to authenticated
with check (owner_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "jobs_update_own_or_admin" on public.jobs;
create policy "jobs_update_own_or_admin"
on public.jobs for update
to authenticated
using (owner_id = auth.uid() or public.current_user_role() = 'admin')
with check (owner_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "candidates_select_own_or_admin" on public.candidates;
create policy "candidates_select_own_or_admin"
on public.candidates for select
to authenticated
using (owner_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "candidates_insert_own_or_admin" on public.candidates;
create policy "candidates_insert_own_or_admin"
on public.candidates for insert
to authenticated
with check (owner_id = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "candidates_update_own_or_admin" on public.candidates;
create policy "candidates_update_own_or_admin"
on public.candidates for update
to authenticated
using (owner_id = auth.uid() or public.current_user_role() = 'admin')
with check (owner_id = auth.uid() or public.current_user_role() = 'admin');
