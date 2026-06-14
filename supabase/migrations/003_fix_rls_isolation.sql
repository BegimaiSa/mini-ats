-- Remove legacy "allow everyone" policies left over from before migration 001.
-- These were PERMISSIVE policies with qual/with_check = true, which OR together
-- with the owner-scoped policies and effectively made them a no-op: any
-- authenticated user could read or insert any customer's jobs/candidates.
-- Run in Supabase SQL editor after checking existing policy names.

drop policy if exists "Enable read access for all users" on public.jobs;
drop policy if exists "Enable insert for all users" on public.jobs;

drop policy if exists "Enable read access for all users" on public.candidates;
drop policy if exists "Enable insert for all users" on public.candidates;
