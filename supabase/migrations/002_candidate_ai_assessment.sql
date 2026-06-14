-- Adds CV text + AI fit-assessment fields to candidates, and helpful
-- owner_id indexes now that admin "act as customer" filters on it.
-- Run in Supabase SQL editor after checking existing table names/columns.

alter table public.candidates add column if not exists cv_text text;
alter table public.candidates add column if not exists ai_score smallint;
alter table public.candidates add column if not exists ai_summary text;

alter table public.candidates drop constraint if exists candidates_ai_score_check;
alter table public.candidates add constraint candidates_ai_score_check
  check (ai_score is null or (ai_score between 1 and 5));

create index if not exists idx_jobs_owner_id on public.jobs(owner_id);
create index if not exists idx_candidates_owner_id on public.candidates(owner_id);
