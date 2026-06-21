-- 관리자 행위 감사 로그.
-- 학부모 계정 복구(이메일 변경/비밀번호 재설정/중복계정 탈퇴)처럼 자격증명에 준하는
-- 변경을 "누가/언제/누구에게/무엇을" 추적하기 위한 경량 테이블.
-- insert 는 service-role(adminClient)이 RLS 우회로 수행하고, 읽기는 관리자만 허용한다.
-- ⚠️ detail 에 평문 비밀번호는 절대 기록하지 않는다(발생 사실만).

create table if not exists public.admin_action_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  target_id uuid references public.profiles(id),
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_action_log_target_idx
  on public.admin_action_log(target_id, created_at desc);

alter table public.admin_action_log enable row level security;

-- 읽기: 관리자만. insert/update/delete 정책은 두지 않으므로 service-role 만 기록 가능.
create policy "admin can read action log"
  on public.admin_action_log
  for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.user_type = 'admin'
    )
  );
