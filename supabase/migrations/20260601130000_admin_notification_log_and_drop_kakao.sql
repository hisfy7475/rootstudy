-- 카카오 알림톡 완전 제거 + 어드민 알림 관리 리팩토링
--
-- 1) admin_notification_log 뷰: 어드민 알림 관리 페이지가 실제 인앱/푸시 알림
--    (student_notifications + user_notifications)을 조회하도록 통합한 뷰.
--    - 두 테이블엔 branch_id 가 없어 학생은 profiles.branch_id 직접, 학부모는
--      parent_student_links → 학생 profiles.branch_id 로 지점을 도출한다.
--    - chat 타입은 제외(학생/학부모 앱과 동일).
--    - row_key: 고유 키 — created_at 중복(대량 발송) 시 페이지네이션 tie-break 용.
--    - 학부모는 동일지점 다자녀로 조인이 증식하므로 (user_notifications.id, branch_id)
--      기준으로 distinct 하여 지점별 1행으로 수렴(자녀 식별자는 select/distinct 에서 제외).
--    - service-role 로만 조회하며 RLS 를 우회하므로, 지점 격리는 서버 액션의
--      .eq('branch_id') 가 책임진다(security_invoker 로 authenticated 직접 조회는 차단).
--
-- 2) 카카오 전용 죽은 테이블(notifications: 발송 0건 / kakao_retry_queue) 제거.

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
  sn.type                                as type,
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
  un.type                                as type,
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
  and cp.branch_id is not null;

grant select on public.admin_notification_log to service_role;

-- 카카오 알림톡 잔재 테이블 제거 (의존 객체 없음 — FK/뷰/트리거 0건 확인)
drop table if exists public.kakao_retry_queue;
drop table if exists public.notifications;
