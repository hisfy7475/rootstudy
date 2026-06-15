-- 관리자 알림 "지점 단위 1건 적재" 리팩토링
--
-- 배경: 멘토링/상담 신청 접수 같은 지점 공유 알림이 기존엔 user_notifications 에
-- 지점 관리자 1명당 1행으로 복제(fan-out) 되었다. 이를 지점당 1행으로 적재하고,
-- 지점 관리자라면 누구나 본인 지점의 모든 알림(출입/상벌점 모니터링 + 멘토링/상담 접수)을
-- 하나의 통합 피드(admin_notification_log)에서 보도록 한다.
--
-- 1) branch_notifications: 지점 단위 1행 알림 테이블. is_read 는 지점 공유(한 관리자가
--    읽으면 지점 전체 읽음 처리). service_role(createAdminClient) 로만 INSERT.
-- 2) admin_notification_log 뷰에 'branch' 수신자 브랜치(3번째 UNION) 추가.

-- ─────────────────────────────────────────────────────────────
-- 1) branch_notifications 테이블
-- ─────────────────────────────────────────────────────────────
create table if not exists public.branch_notifications (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references public.branches(id) on delete cascade,
  type        text not null default 'system',
  title       text not null,
  message     text not null,
  link        text,
  is_read     boolean not null default false,
  read_by     uuid references public.profiles(id),
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists idx_branch_notifications_branch_created
  on public.branch_notifications (branch_id, created_at desc);
create index if not exists idx_branch_notifications_branch_unread
  on public.branch_notifications (branch_id) where is_read = false;

alter table public.branch_notifications enable row level security;

-- SELECT: admin 본인 지점 또는 슈퍼=전체 (attendance/chat_rooms 정책 패턴 재사용)
drop policy if exists "Admins view branch notifications" on public.branch_notifications;
create policy "Admins view branch notifications" on public.branch_notifications
  for select to authenticated
  using (
    (get_user_type() = 'admin')
    and (public.is_super_admin() or branch_id = public.get_admin_branch_id())
  );

-- UPDATE: 지점 공유 읽음 처리 — 같은 지점 admin 누구나. branch_id 불변이라 with check 동일 조건.
drop policy if exists "Admins update branch notifications read" on public.branch_notifications;
create policy "Admins update branch notifications read" on public.branch_notifications
  for update to authenticated
  using (
    (get_user_type() = 'admin')
    and (public.is_super_admin() or branch_id = public.get_admin_branch_id())
  )
  with check (
    (get_user_type() = 'admin')
    and (public.is_super_admin() or branch_id = public.get_admin_branch_id())
  );

-- INSERT 정책 없음 → authenticated INSERT 차단. 적재는 service_role(createAdminClient)만.

-- realtime: 사이드바 뱃지/피드 실시간 갱신. RLS 가 자동 적용되어 admin 은 본인 지점만 수신.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'branch_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.branch_notifications;
  END IF;
END $$;

-- REPLICA IDENTITY FULL: UPDATE/DELETE WAL payload 에 전체 row 포함 → listener 별 RLS 평가용.
ALTER TABLE public.branch_notifications REPLICA IDENTITY FULL;

-- ─────────────────────────────────────────────────────────────
-- 2) admin_notification_log 뷰 확장 (20260601130000 원본 + 'branch' 브랜치)
--    type 은 세 테이블 모두 text 이며, UNION 컬럼 정합 명시화를 위해 ::text 로 통일.
-- ─────────────────────────────────────────────────────────────
create or replace view public.admin_notification_log
with (security_invoker = true)
as
-- 학생 알림
select
  ('s:' || sn.id::text)                  as row_key,
  sn.id                                  as id,
  'student'::text                        as recipient_type,
  sn.student_id                          as recipient_id,
  coalesce(p.name, '알 수 없음')          as recipient_name,
  sp.seat_number                         as recipient_seat_number,
  p.branch_id                            as branch_id,
  sn.type::text                          as type,
  sn.title                               as title,
  sn.message                             as message,
  sn.link                                as link,
  sn.is_read                             as is_read,
  sn.created_at                          as created_at
from public.student_notifications sn
join public.profiles p          on p.id = sn.student_id
left join public.student_profiles sp on sp.id = sn.student_id
where sn.type <> 'chat'
  and p.branch_id is not null

union all

-- 학부모 알림 (parent_student_links → 학생 지점, 동일지점 중복은 distinct 로 수렴)
select distinct
  ('p:' || un.id::text || ':' || cp.branch_id::text) as row_key,
  un.id                                  as id,
  'parent'::text                         as recipient_type,
  un.user_id                             as recipient_id,
  coalesce(pp.name, '알 수 없음')         as recipient_name,
  null::integer                          as recipient_seat_number,
  cp.branch_id                           as branch_id,
  un.type::text                          as type,
  un.title                               as title,
  un.message                             as message,
  un.link                                as link,
  un.is_read                             as is_read,
  un.created_at                          as created_at
from public.user_notifications un
join public.profiles pp           on pp.id = un.user_id and pp.user_type = 'parent'
join public.parent_student_links psl on psl.parent_id = un.user_id
join public.profiles cp           on cp.id = psl.student_id
where un.type <> 'chat'
  and cp.branch_id is not null

union all

-- 지점 공용 알림 (멘토링/상담 접수 등) — 지점당 1행
select
  ('b:' || bn.id::text)                  as row_key,
  bn.id                                  as id,
  'branch'::text                         as recipient_type,
  bn.branch_id                           as recipient_id,
  '지점 공용'::text                       as recipient_name,
  null::integer                          as recipient_seat_number,
  bn.branch_id                           as branch_id,
  bn.type::text                          as type,
  bn.title                               as title,
  bn.message                             as message,
  bn.link                                as link,
  bn.is_read                             as is_read,
  bn.created_at                          as created_at
from public.branch_notifications bn;

-- create or replace view 가 grant 를 보존하지 않을 수 있으므로 재실행(누락 시 service_role 조회 회귀).
grant select on public.admin_notification_log to service_role;
