-- 슈퍼관리자(최고 관리자) 컬럼 도입.
-- 일반 어드민 권한의 superset. user_type='admin'을 그대로 유지해
-- 기존 30+개 RLS/RPC 의 user_type='admin' 체크를 자동 통과한다.
-- 슈퍼관리자만 가능한 동작: 어드민 추가/삭제/지점 변경,
--   다른 어드민 비밀번호 강제 재설정, 슈퍼 권한 부여/회수, 전 지점 조회.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_super_admin boolean NOT NULL DEFAULT false;

-- 학생/학부모는 슈퍼가 될 수 없다. NOT VALID 후 즉시 VALIDATE 로 기존 행 점검.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_super_admin_only_admin;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_super_admin_only_admin
  CHECK (is_super_admin = false OR user_type = 'admin')
  NOT VALID;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_super_admin_only_admin;

-- 부트스트랩: 클라이언트 지정 슈퍼관리자.
-- 적용 시점에 해당 어드민이 가입돼 있어야 함.
-- 가입 전이라면 0행 업데이트로 끝나고, 가입 후 SQL 로 재실행하거나
-- 다른 슈퍼관리자가 UI 에서 토글하면 됨.
UPDATE public.profiles
SET is_super_admin = true
WHERE user_type = 'admin'
  AND email = 'test@test.com';
