-- 학부모는 "자녀를 따른다" 정책으로 변경.
-- profiles.branch_id 컬럼을 parent에게는 더 이상 사용하지 않는다.
-- scope는 서버 액션에서 parent_student_links → students.branch_id UNION으로 동적 계산.
--
-- 이 migration은:
--   1) 요청자의 허용 branch_id 집합을 반환하는 공용 SQL 함수 auth_branch_ids() 생성
--      (현재는 RLS가 이 함수를 참조하지 않지만, 이후 RLS 정책을 추가할 때 재사용 가능).
--   2) 기존 parent profiles의 branch_id를 백업 후 NULL로 초기화.

-- ---------------------------------------------------------------------------
-- 1) auth_branch_ids() — 로그인 사용자의 허용 branch_id 배열
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_branch_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
PARALLEL SAFE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(ARRAY_AGG(DISTINCT b.branch_id), ARRAY[]::uuid[])
  FROM (
    SELECT p.branch_id
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.user_type IN ('admin', 'student')
      AND p.branch_id IS NOT NULL
    UNION
    SELECT s.branch_id
    FROM public.parent_student_links psl
    JOIN public.profiles s ON s.id = psl.student_id
    WHERE psl.parent_id = auth.uid()
      AND s.branch_id IS NOT NULL
  ) b;
$$;

REVOKE EXECUTE ON FUNCTION public.auth_branch_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_branch_ids() TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) 기존 parent profiles.branch_id 백업 + NULL 초기화
-- ---------------------------------------------------------------------------

-- 복구용 백업 테이블 (기존 테이블 있으면 skip — 재적용 시 중복 insert 방지)
CREATE TABLE IF NOT EXISTS public._bkp_parent_branch (
  id uuid PRIMARY KEY,
  branch_id uuid,
  backed_up_at timestamptz NOT NULL DEFAULT now()
);

-- 백업 테이블 권한 차단 (service_role만 접근 가능)
ALTER TABLE public._bkp_parent_branch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._bkp_parent_branch FROM anon, authenticated;

-- 이미 비어있지 않은 parent row 만 백업 (재실행 안전)
INSERT INTO public._bkp_parent_branch (id, branch_id)
SELECT p.id, p.branch_id
FROM public.profiles p
WHERE p.user_type = 'parent'
  AND p.branch_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- parent의 branch_id NULL 로 통일
UPDATE public.profiles
SET branch_id = NULL
WHERE user_type = 'parent'
  AND branch_id IS NOT NULL;
