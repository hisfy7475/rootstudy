-- 영단어 예습·시험 기능 (vocab) 스키마.
-- PRD: .00_manager/plan/영단어시험_PRD.md
--
-- 테이블:
--   vocab_packs          단어 꾸러미 (LEVEL 1, KICE 빈출 등 — 관리자가 직접 생성)
--   vocab_words          단어 (꾸러미와 독립, lower(english) 유일)
--   vocab_pack_words     꾸러미↔단어 M:N
--   vocab_exams          시험 응시 헤더 (학생당 학습일 1회)
--   vocab_exam_questions 문항·답안 스냅샷 (사후 단어 변경과 무관하게 결과 보존)
--
-- RLS: 마스터(packs/words/pack_words)는 슈퍼관리자만 쓰기, 학생은 공개분만 읽기.
--      응시(exams/questions)는 학생 본인 + 관리자(슈퍼=전체 / 지점=자기 지점 학생).
--      기존 헬퍼 is_super_admin()/get_user_type()/get_admin_branch_id() 재사용,
--      InitPlan 최적화를 위해 (select f()) 로 래핑한다.

-- =============================================
-- vocab_packs — 단어 꾸러미
-- =============================================
create table if not exists public.vocab_packs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  description text,
  status text not null default 'preparing'
    check (status in ('preparing', 'public', 'hidden', 'disabled')),
  display_order int not null default 0,
  publish_start_at timestamptz,
  publish_end_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vocab_packs_status_order
  on public.vocab_packs (status, display_order);

drop trigger if exists trg_vocab_packs_updated_at on public.vocab_packs;
create trigger trg_vocab_packs_updated_at
  before update on public.vocab_packs
  for each row execute function public.update_updated_at_column();

-- =============================================
-- vocab_words — 단어
-- =============================================
create table if not exists public.vocab_words (
  id uuid primary key default gen_random_uuid(),
  english text not null,
  korean_primary text not null,
  korean_extra text,
  problem_group text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 대소문자만 다른 경우 동일 단어로 판단
create unique index if not exists uq_vocab_words_lower_english
  on public.vocab_words (lower(english));

create index if not exists idx_vocab_words_active
  on public.vocab_words (is_active);

drop trigger if exists trg_vocab_words_updated_at on public.vocab_words;
create trigger trg_vocab_words_updated_at
  before update on public.vocab_words
  for each row execute function public.update_updated_at_column();

-- =============================================
-- vocab_pack_words — 꾸러미↔단어 (M:N)
-- =============================================
create table if not exists public.vocab_pack_words (
  pack_id uuid not null references public.vocab_packs (id) on delete cascade,
  word_id uuid not null references public.vocab_words (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (pack_id, word_id)
);

-- 단어 → 꾸러미 역방향 조회용 (pack_id 는 PK 선두라 별도 인덱스 불필요)
create index if not exists idx_vocab_pack_words_word
  on public.vocab_pack_words (word_id);

-- =============================================
-- vocab_exams — 시험 응시 헤더
-- =============================================
create table if not exists public.vocab_exams (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  pack_id uuid not null references public.vocab_packs (id) on delete restrict,
  exam_type text not null default 'normal'
    check (exam_type in ('normal', 'friday_review')),
  exam_date date not null,
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  submit_type text not null default 'in_progress'
    check (submit_type in ('in_progress', 'normal', 'auto')),
  score int,
  total int not null default 40,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- 계정 기준 학습일 1회 (멱등 시작의 충돌 키)
  constraint uq_vocab_exams_student_date unique (student_id, exam_date)
);

create index if not exists idx_vocab_exams_pack
  on public.vocab_exams (pack_id);

-- 미완료(진행 중) 시험 lazy/크론 마감 스캔용
create index if not exists idx_vocab_exams_open
  on public.vocab_exams (submitted_at, started_at)
  where submitted_at is null;

drop trigger if exists trg_vocab_exams_updated_at on public.vocab_exams;
create trigger trg_vocab_exams_updated_at
  before update on public.vocab_exams
  for each row execute function public.update_updated_at_column();

-- =============================================
-- vocab_exam_questions — 문항·답안 스냅샷
-- =============================================
create table if not exists public.vocab_exam_questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.vocab_exams (id) on delete cascade,
  question_no int not null,
  word_id uuid references public.vocab_words (id) on delete set null,
  english_snapshot text not null,
  answer_snapshot text not null,
  options jsonb not null,
  selected text,
  is_correct boolean,
  constraint uq_vocab_exam_questions_no unique (exam_id, question_no)
);

create index if not exists idx_vocab_exam_questions_exam
  on public.vocab_exam_questions (exam_id);

-- =============================================
-- RLS
-- =============================================
alter table public.vocab_packs enable row level security;
alter table public.vocab_words enable row level security;
alter table public.vocab_pack_words enable row level security;
alter table public.vocab_exams enable row level security;
alter table public.vocab_exam_questions enable row level security;

-- ---- vocab_packs ----
-- 읽기: 관리자 전체 / 학생·학부모는 완전 숨김(disabled/hidden) 제외.
--   세부 노출(공개기간 등)은 서버 액션에서 추가 필터. preparing 은 "준비중" 배지로 노출해야 하므로 읽기는 허용.
drop policy if exists "vocab_packs read" on public.vocab_packs;
create policy "vocab_packs read" on public.vocab_packs for select
using (
  ((select get_user_type()) = 'admin')
  or status in ('public', 'preparing')
);

-- 쓰기: 슈퍼관리자만
drop policy if exists "vocab_packs write" on public.vocab_packs;
create policy "vocab_packs write" on public.vocab_packs for all
using ((select is_super_admin()))
with check ((select is_super_admin()));

-- ---- vocab_words ----
drop policy if exists "vocab_words read" on public.vocab_words;
create policy "vocab_words read" on public.vocab_words for select
using (
  ((select get_user_type()) = 'admin') or is_active
);

drop policy if exists "vocab_words write" on public.vocab_words;
create policy "vocab_words write" on public.vocab_words for all
using ((select is_super_admin()))
with check ((select is_super_admin()));

-- ---- vocab_pack_words ----
drop policy if exists "vocab_pack_words read" on public.vocab_pack_words;
create policy "vocab_pack_words read" on public.vocab_pack_words for select
using (true);

drop policy if exists "vocab_pack_words write" on public.vocab_pack_words;
create policy "vocab_pack_words write" on public.vocab_pack_words for all
using ((select is_super_admin()))
with check ((select is_super_admin()));

-- ---- vocab_exams ----
-- 학생 본인
drop policy if exists "vocab_exams student own" on public.vocab_exams;
create policy "vocab_exams student own" on public.vocab_exams for all
using (student_id = (select auth.uid()))
with check (student_id = (select auth.uid()));

-- 관리자 (슈퍼=전체 / 지점=자기 지점 학생)
drop policy if exists "vocab_exams admin" on public.vocab_exams;
create policy "vocab_exams admin" on public.vocab_exams for select
using (
  ((select get_user_type()) = 'admin') and ((select is_super_admin()) or exists (
    select 1 from public.profiles
    where profiles.id = vocab_exams.student_id
      and profiles.branch_id = (select get_admin_branch_id())
  ))
);

-- ---- vocab_exam_questions ----
-- 학생 본인 (상위 시험 소유 확인)
drop policy if exists "vocab_exam_questions student own" on public.vocab_exam_questions;
create policy "vocab_exam_questions student own" on public.vocab_exam_questions for all
using (exists (
  select 1 from public.vocab_exams e
  where e.id = vocab_exam_questions.exam_id and e.student_id = (select auth.uid())
))
with check (exists (
  select 1 from public.vocab_exams e
  where e.id = vocab_exam_questions.exam_id and e.student_id = (select auth.uid())
));

-- 관리자 (상위 시험의 학생 지점 기준)
drop policy if exists "vocab_exam_questions admin" on public.vocab_exam_questions;
create policy "vocab_exam_questions admin" on public.vocab_exam_questions for select
using (
  ((select get_user_type()) = 'admin') and exists (
    select 1 from public.vocab_exams e
    join public.profiles p on p.id = e.student_id
    where e.id = vocab_exam_questions.exam_id
      and ((select is_super_admin()) or p.branch_id = (select get_admin_branch_id()))
  )
);
