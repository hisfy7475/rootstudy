-- 지점관리자(non-super admin)가 학생 상세 모달에서 '연결된 학부모'를 보지 못하던 문제 수정.
--
-- 원인: 학부모(profiles.user_type='parent')는 전원 branch_id=NULL 이라
--       기존 "Admins can view all profiles" 정책의 (is_super_admin() OR branch_id = get_admin_branch_id())
--       조건을 통과하지 못함. getStudentDetail 의 profiles!inner 임베드에서 학부모 행이 탈락 →
--       전 학생이 '미연결'로 노출됨. (목록 뷰는 service-role 우회라 정상이었음.)
--
-- 해결: '학부모 가시성 = 연결된 자녀로부터 파생' 규칙을 RLS 에 명시.
--       지점관리자는 '자기 지점 학생과 연결된 학부모' 프로필만 읽을 수 있게 SELECT 정책을 가산한다.
--       (기존 정책은 그대로 두며, 같은 SELECT 명령의 PERMISSIVE 정책들은 OR 로 합산되어 권한만 확대됨.)

-- 관리자가 특정 학부모 프로필을 볼 수 있는지 판정.
-- 슈퍼관리자는 무제한, 지점관리자는 자기 지점 학생과 연결된 학부모만.
-- SECURITY DEFINER: 함수 소유자(BYPASSRLS) 권한으로 실행되어 profiles RLS 재진입(재귀)을 회피.
create or replace function public.admin_can_view_parent(parent_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.parent_student_links psl
    join public.profiles s on s.id = psl.student_id
    where psl.parent_id = parent_profile_id
      and (
        public.is_super_admin()
        or s.branch_id = public.get_admin_branch_id()
      )
  );
$$;

-- 추가 정책: 지점관리자도 '내 지점 학생과 연결된 학부모' 프로필을 읽을 수 있게 함.
drop policy if exists "Admins can view linked parents" on public.profiles;
create policy "Admins can view linked parents" on public.profiles
  for select
  using (
    get_user_type() = 'admin'
    and user_type = 'parent'
    and public.admin_can_view_parent(id)
  );
