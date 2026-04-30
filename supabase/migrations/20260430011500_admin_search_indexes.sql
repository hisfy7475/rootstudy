-- 어드민 검색 통일 PR — 검색 컬럼 인덱스 보강.
-- 기존 인덱스는 정렬·필터 조합이지만, 검색은 ilike `%X%` 풀스캔이었음.
-- 데이터 증가 시를 대비해 trigram GIN 인덱스로 부분 일치를 가속.

create extension if not exists pg_trgm;

-- profiles: 회원 검색 (이름·이메일·전화).
create index if not exists idx_profiles_name_trgm
  on public.profiles using gin (name gin_trgm_ops);
create index if not exists idx_profiles_email_trgm
  on public.profiles using gin (email gin_trgm_ops);
create index if not exists idx_profiles_phone_trgm
  on public.profiles using gin (phone gin_trgm_ops);

-- student_absence_schedules: 부재 일정 제목 검색.
create index if not exists idx_absence_schedules_title_trgm
  on public.student_absence_schedules using gin (title gin_trgm_ops);

-- student_profiles.seat_number 정렬·prefix 매칭용 (trigram 은 정수형 비효율 → B-tree).
-- 이미 존재하는 경우가 많으나 누락 보강.
create index if not exists idx_student_profiles_seat_number
  on public.student_profiles (seat_number);
