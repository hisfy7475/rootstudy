-- 핫패스 RLS 정책 initplan 최적화 (attendance, focus_scores, points, student_profiles)
--
-- 배경: 성능 advisor auth_rls_initplan — 정책이 get_user_type()/is_super_admin()/
--   get_admin_branch_id()/auth.uid() 를 행마다 재평가한다. 이 함수들은 모두 STABLE 이라
--   (select f()) 로 감싸면 Postgres 가 InitPlan 으로 쿼리당 1회만 평가한다.
--   관리자 목록 페이지처럼 RLS 로 수백 행을 읽는 쿼리의 CPU 를 줄인다.
--
-- 안전성: (select f()) 는 STABLE 함수에 대해 f() 와 의미가 동일하다(반환값 불변).
--   가시 행/권한은 바뀌지 않으며 평가 횟수만 줄어든다. 로직은 일절 변경하지 않고 래핑만 한다.
--   parent 정책의 is_linked_student(id) 는 행 인자라 InitPlan 불가 → 그대로 둔다.

-- ===== attendance =====
drop policy if exists "Admins can insert attendance" on public.attendance;
create policy "Admins can insert attendance" on public.attendance for insert
with check (
  ((select get_user_type()) = 'admin') and ((select is_super_admin()) or exists (
    select 1 from public.profiles
    where profiles.id = attendance.student_id and profiles.branch_id = (select get_admin_branch_id())
  ))
);

drop policy if exists "Students can insert their own attendance" on public.attendance;
create policy "Students can insert their own attendance" on public.attendance for insert
with check (student_id = (select auth.uid()));

drop policy if exists "Admins can view all attendance" on public.attendance;
create policy "Admins can view all attendance" on public.attendance for select
using (
  ((select get_user_type()) = 'admin') and ((select is_super_admin()) or exists (
    select 1 from public.profiles
    where profiles.id = attendance.student_id and profiles.branch_id = (select get_admin_branch_id())
  ))
);

drop policy if exists "Parents can view their children attendance" on public.attendance;
create policy "Parents can view their children attendance" on public.attendance for select
using (
  student_id in (
    select parent_student_links.student_id from public.parent_student_links
    where parent_student_links.parent_id = (select auth.uid())
  )
);

drop policy if exists "Students can view their own attendance" on public.attendance;
create policy "Students can view their own attendance" on public.attendance for select
using (student_id = (select auth.uid()));

-- ===== focus_scores =====
drop policy if exists "Admins can manage all focus scores" on public.focus_scores;
create policy "Admins can manage all focus scores" on public.focus_scores for all
using (
  ((select get_user_type()) = 'admin') and ((select is_super_admin()) or exists (
    select 1 from public.profiles
    where profiles.id = focus_scores.student_id and profiles.branch_id = (select get_admin_branch_id())
  ))
)
with check (
  ((select get_user_type()) = 'admin') and ((select is_super_admin()) or exists (
    select 1 from public.profiles
    where profiles.id = focus_scores.student_id and profiles.branch_id = (select get_admin_branch_id())
  ))
);

drop policy if exists "Parents can view linked student focus scores" on public.focus_scores;
create policy "Parents can view linked student focus scores" on public.focus_scores for select
using (
  exists (
    select 1 from public.parent_student_links
    where parent_student_links.parent_id = (select auth.uid())
      and parent_student_links.student_id = focus_scores.student_id
  )
);

drop policy if exists "Parents can view their children focus_scores" on public.focus_scores;
create policy "Parents can view their children focus_scores" on public.focus_scores for select
using (
  student_id in (
    select parent_student_links.student_id from public.parent_student_links
    where parent_student_links.parent_id = (select auth.uid())
  )
);

drop policy if exists "Students can view their own focus scores" on public.focus_scores;
create policy "Students can view their own focus scores" on public.focus_scores for select
using (student_id = (select auth.uid()));

-- ===== points =====
drop policy if exists "Admins can manage all points" on public.points;
create policy "Admins can manage all points" on public.points for all
using (
  ((select get_user_type()) = 'admin') and ((select is_super_admin()) or exists (
    select 1 from public.profiles
    where profiles.id = points.student_id and profiles.branch_id = (select get_admin_branch_id())
  ))
)
with check (
  ((select get_user_type()) = 'admin') and ((select is_super_admin()) or exists (
    select 1 from public.profiles
    where profiles.id = points.student_id and profiles.branch_id = (select get_admin_branch_id())
  ))
);

drop policy if exists "Parents can view linked student points" on public.points;
create policy "Parents can view linked student points" on public.points for select
using (
  exists (
    select 1 from public.parent_student_links
    where parent_student_links.parent_id = (select auth.uid())
      and parent_student_links.student_id = points.student_id
  )
);

drop policy if exists "Students can view their own points" on public.points;
create policy "Students can view their own points" on public.points for select
using (student_id = (select auth.uid()));

-- ===== student_profiles =====
drop policy if exists "Students can insert own student_profile" on public.student_profiles;
create policy "Students can insert own student_profile" on public.student_profiles for insert
with check ((select auth.uid()) = id);

drop policy if exists "Admins can view all student_profiles" on public.student_profiles;
create policy "Admins can view all student_profiles" on public.student_profiles for select
using (
  ((select get_user_type()) = 'admin') and ((select is_super_admin()) or exists (
    select 1 from public.profiles
    where profiles.id = student_profiles.id and profiles.branch_id = (select get_admin_branch_id())
  ))
);

drop policy if exists "Students can view own student_profile" on public.student_profiles;
create policy "Students can view own student_profile" on public.student_profiles for select
using ((select auth.uid()) = id);

drop policy if exists "Admins can update student_profiles" on public.student_profiles;
create policy "Admins can update student_profiles" on public.student_profiles for update
using (
  ((select get_user_type()) = 'admin') and ((select is_super_admin()) or exists (
    select 1 from public.profiles
    where profiles.id = student_profiles.id and profiles.branch_id = (select get_admin_branch_id())
  ))
)
with check (
  ((select get_user_type()) = 'admin') and ((select is_super_admin()) or exists (
    select 1 from public.profiles
    where profiles.id = student_profiles.id and profiles.branch_id = (select get_admin_branch_id())
  ))
);

drop policy if exists "Students can update own student_profile" on public.student_profiles;
create policy "Students can update own student_profile" on public.student_profiles for update
using ((select auth.uid()) = id);
