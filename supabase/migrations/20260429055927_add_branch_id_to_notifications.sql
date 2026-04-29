-- notifications 테이블에 branch_id 추가 + RLS 격리.
-- 현재 어드민 RLS 가 모든 알림을 모든 admin 에게 SELECT 허용해
-- 다른 지점 admin 도 자기 지점 외 알림을 볼 수 있는 누수가 있음.

-- 1. 컬럼 추가 (먼저 nullable 로)
alter table public.notifications
  add column if not exists branch_id uuid references public.branches(id);

-- 2. 백필 — student_id 가 있는 경우 학생의 branch 사용
update public.notifications n
set branch_id = p.branch_id
from public.student_profiles sp
join public.profiles p on p.id = sp.id
where n.student_id = sp.id
  and n.branch_id is null
  and p.branch_id is not null;

-- 3. 백필 — parent_id 만 있는 경우 학부모와 연결된 첫 자녀의 branch 사용
update public.notifications n
set branch_id = sub.branch_id
from (
  select distinct on (psl.parent_id) psl.parent_id, p.branch_id
  from public.parent_student_links psl
  join public.profiles p on p.id = psl.student_id
  where p.branch_id is not null
  order by psl.parent_id, psl.created_at asc
) sub
where n.parent_id = sub.parent_id
  and n.branch_id is null;

-- 4. 안전망 — 위 백필로도 못 채운 행 (학생/학부모 모두 NULL 또는 branch 미할당) 은
-- 첫 활성 지점으로 폴백. 실제로는 거의 발생 안 함.
update public.notifications
set branch_id = (
  select id from public.branches where is_active = true order by created_at limit 1
)
where branch_id is null;

-- 5. 그래도 NULL 이면 마이그레이션 중단 (활성 지점이 0개인 비정상 환경)
do $$
declare
  null_count int;
begin
  select count(*) into null_count from public.notifications where branch_id is null;
  if null_count > 0 then
    raise exception 'notifications.branch_id 백필 실패: % rows still NULL. 활성 지점이 없는지 확인.', null_count;
  end if;
end $$;

-- 6. NOT NULL 부여
alter table public.notifications
  alter column branch_id set not null;

-- 7. 인덱스 — branch + sent_at desc 페이지네이션용
create index if not exists idx_notifications_branch_id_sent_at
  on public.notifications (branch_id, sent_at desc);

-- 8. RLS 정책 갱신 — admin 은 자기 branch 알림만 SELECT
drop policy if exists "Admins can view all notifications" on public.notifications;

create policy "Admins can view branch notifications"
  on public.notifications
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.user_type = 'admin'
    )
    and branch_id = public.get_admin_branch_id()
  );

-- INSERT 정책은 기존 유지 (admin 가 자기 branch 알림만 INSERT 하도록 코드에서 보장)
-- 학부모 SELECT 정책 (`Parents can view own notifications`) 은 그대로 유효.
