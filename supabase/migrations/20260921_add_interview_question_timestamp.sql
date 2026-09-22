alter table public.interview_questions
  add column if not exists created_at timestamptz not null default now();

create index if not exists interview_questions_interview_id_created_at_idx
  on public.interview_questions (interview_id, created_at asc);