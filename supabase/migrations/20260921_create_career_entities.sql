create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  name text not null,
  file_url text,
  file_type text,
  raw_text text,
  parsed_data jsonb not null default jsonb_build_object(
    'summary', '',
    'skills', '[]'::jsonb,
    'experience', '[]'::jsonb,
    'education', '[]'::jsonb,
    'certifications', '[]'::jsonb,
    'achievements', '[]'::jsonb
  ),
  is_master boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.jobs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  company text not null,
  job_title text not null,
  job_url text,
  job_description text,
  parsed_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.job_cv_analysis (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  resume_id uuid not null references public.resumes(id) on delete cascade,
  match_score integer not null default 0 check (match_score between 0 and 100),
  strengths jsonb not null default '[]'::jsonb,
  skill_gaps jsonb not null default '[]'::jsonb,
  missing_keywords jsonb not null default '[]'::jsonb,
  matched_keywords jsonb not null default '[]'::jsonb,
  analysis_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (job_id, resume_id)
);

create table if not exists public.recommendations (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.job_cv_analysis(id) on delete cascade,
  resume_section text not null,
  original_text text not null,
  suggested_text text not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.cv_versions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  parent_resume_id uuid references public.resumes(id) on delete set null,
  version_number integer not null check (version_number > 0),
  file_url text,
  changes_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (job_id, version_number)
);

create table if not exists public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.users(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  cv_version_id uuid references public.cv_versions(id) on delete set null,
  status text not null default 'saved' check (
    status in ('saved', 'applied', 'screening', 'interview', 'offer', 'rejected', 'withdrawn')
  ),
  applied_date timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  type text not null default 'mock',
  status text not null default 'pending',
  score integer check (score between 0 and 100),
  feedback text,
  created_at timestamptz not null default now()
);

create table if not exists public.interview_questions (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  question text not null,
  category text,
  difficulty text,
  expected_topics jsonb not null default '[]'::jsonb
);

create table if not exists public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.interview_questions(id) on delete cascade,
  answer text not null,
  score integer check (score between 0 and 100),
  strengths jsonb not null default '[]'::jsonb,
  improvements jsonb not null default '[]'::jsonb,
  feedback text,
  created_at timestamptz not null default now()
);

create index if not exists resumes_user_id_created_at_idx on public.resumes (user_id, created_at desc);
create index if not exists jobs_user_id_created_at_idx on public.jobs (user_id, created_at desc);
create index if not exists job_cv_analysis_job_id_idx on public.job_cv_analysis (job_id);
create index if not exists recommendations_analysis_id_idx on public.recommendations (analysis_id);
create index if not exists cv_versions_user_id_job_id_idx on public.cv_versions (user_id, job_id, version_number desc);
create index if not exists applications_user_id_created_at_idx on public.applications (user_id, created_at desc);
create index if not exists interviews_application_id_idx on public.interviews (application_id);
create index if not exists interview_questions_interview_id_idx on public.interview_questions (interview_id);
create index if not exists interview_answers_question_id_idx on public.interview_answers (question_id);

alter table public.resumes enable row level security;
alter table public.jobs enable row level security;
alter table public.job_cv_analysis enable row level security;
alter table public.recommendations enable row level security;
alter table public.cv_versions enable row level security;
alter table public.applications enable row level security;
alter table public.interviews enable row level security;
alter table public.interview_questions enable row level security;
alter table public.interview_answers enable row level security;

drop policy if exists resumes_workspace on public.resumes;
create policy resumes_workspace on public.resumes
  for all using (
    user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
  ) with check (
    user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
  );

drop policy if exists jobs_workspace on public.jobs;
create policy jobs_workspace on public.jobs
  for all using (
    user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
  ) with check (
    user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
  );

drop policy if exists job_cv_analysis_workspace on public.job_cv_analysis;
create policy job_cv_analysis_workspace on public.job_cv_analysis
  for all using (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
    )
  ) with check (
    exists (
      select 1 from public.jobs j
      where j.id = job_id
        and j.user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
    )
  );

drop policy if exists recommendations_workspace on public.recommendations;
create policy recommendations_workspace on public.recommendations
  for all using (
    exists (
      select 1
      from public.job_cv_analysis a
      join public.jobs j on j.id = a.job_id
      where a.id = analysis_id
        and j.user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
    )
  ) with check (
    exists (
      select 1
      from public.job_cv_analysis a
      join public.jobs j on j.id = a.job_id
      where a.id = analysis_id
        and j.user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
    )
  );

drop policy if exists cv_versions_workspace on public.cv_versions;
create policy cv_versions_workspace on public.cv_versions
  for all using (
    user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
  ) with check (
    user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
  );

drop policy if exists applications_workspace on public.applications;
create policy applications_workspace on public.applications
  for all using (
    user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
  ) with check (
    user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
  );

drop policy if exists interviews_workspace on public.interviews;
create policy interviews_workspace on public.interviews
  for all using (
    exists (
      select 1
      from public.applications a
      where a.id = application_id
        and a.user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
    )
  ) with check (
    exists (
      select 1
      from public.applications a
      where a.id = application_id
        and a.user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
    )
  );

drop policy if exists interview_questions_workspace on public.interview_questions;
create policy interview_questions_workspace on public.interview_questions
  for all using (
    exists (
      select 1
      from public.interviews i
      join public.applications a on a.id = i.application_id
      where i.id = interview_id
        and a.user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
    )
  ) with check (
    exists (
      select 1
      from public.interviews i
      join public.applications a on a.id = i.application_id
      where i.id = interview_id
        and a.user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
    )
  );

drop policy if exists interview_answers_workspace on public.interview_answers;
create policy interview_answers_workspace on public.interview_answers
  for all using (
    exists (
      select 1
      from public.interview_questions q
      join public.interviews i on i.id = q.interview_id
      join public.applications a on a.id = i.application_id
      where q.id = question_id
        and a.user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
    )
  ) with check (
    exists (
      select 1
      from public.interview_questions q
      join public.interviews i on i.id = q.interview_id
      join public.applications a on a.id = i.application_id
      where q.id = question_id
        and a.user_id = coalesce((current_setting('request.headers', true)::json ->> 'x-career-workspace'), '')
    )
  );