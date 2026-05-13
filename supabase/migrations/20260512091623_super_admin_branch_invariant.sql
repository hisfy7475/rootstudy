-- 슈퍼 관리자 ↔ branch_id 불변식 + branches mutation 슈퍼 전용 정책
--
-- 배경:
--   - profiles 에 is_super_admin / branch_id 동시 보유 모순 존재 (운영 자료 확인)
--   - 기존 branches RLS 의 "Admins can manage branches" 정책이 user_type='admin' 만 체크,
--     is_super_admin 미반영 → 일반 지점 관리자도 지점 mutation 통과
--
-- 변경:
--   1) 슈퍼 관리자의 branch_id NULL 백필
--   2) profiles 에 슈퍼+지점 동시 보유 금지 CHECK 제약 추가
--   3) 기존 branches "Admins can manage branches" 정책 DROP
--   4) branches INSERT/UPDATE/DELETE 정책 3개를 슈퍼 관리자 전용으로 재구성
--   5) SELECT 정책 2개 ("Anyone can view active branches" / "Authenticated users can view branches") 는 그대로 유지
--
-- SELECT 정책을 건드리지 않으므로 학생 회원가입(anon) 흐름은 영향 없음.

begin;

-- 1. 기존 데이터 백필: 슈퍼 관리자의 branch_id 를 NULL 로 정리.
update public.profiles
set branch_id = null
where user_type = 'admin'
  and is_super_admin = true
  and branch_id is not null;

-- 2. 불변식 CHECK 제약.
alter table public.profiles
  add constraint profiles_super_admin_no_branch
  check (not (is_super_admin and branch_id is not null));

-- 3. 기존 ALL 정책 제거 (일반 관리자도 mutation 통과시키던 정책).
drop policy if exists "Admins can manage branches" on public.branches;

-- 4. INSERT/UPDATE/DELETE 를 슈퍼 관리자 전용으로 재구성.
create policy "branches_insert_super_admin"
  on public.branches for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and user_type = 'admin'
        and is_super_admin = true
    )
  );

create policy "branches_update_super_admin"
  on public.branches for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and user_type = 'admin'
        and is_super_admin = true
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and user_type = 'admin'
        and is_super_admin = true
    )
  );

create policy "branches_delete_super_admin"
  on public.branches for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and user_type = 'admin'
        and is_super_admin = true
    )
  );

commit;
