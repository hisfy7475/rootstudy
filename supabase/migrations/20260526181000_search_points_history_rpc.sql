-- 상벌점 내역 검색을 학생 이름까지 확장
--
-- 변경: 기존 getAllPointsHistory(admin.ts) 가 reason 컬럼만 ilike 검색하던 것을
-- "사유 OR 학생 이름" 검색으로 확장. PostgREST .or() + foreign-table 페이지네이션
-- 정확도 문제를 피하기 위해 단일 SQL RPC 로 처리.
--
-- SECURITY INVOKER — admin RLS 정책(points/profiles/student_profiles)이 branch
-- 격리를 자동 처리. 호출자가 admin 권한이 없으면 RLS 로 0건 반환.

CREATE OR REPLACE FUNCTION public.search_points_history(
  p_q text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_student_id uuid DEFAULT NULL,
  p_sort text DEFAULT 'created_at',
  p_dir text DEFAULT 'desc',
  p_offset int DEFAULT 0,
  p_limit int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  student_id uuid,
  admin_id uuid,
  type text,
  amount int,
  reason text,
  is_auto boolean,
  created_at timestamptz,
  student_name text,
  student_seat_number int,
  admin_name text,
  total_count bigint
)
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = public
AS $$
DECLARE
  v_q text := NULLIF(trim(p_q), '');
  v_pattern text;
BEGIN
  IF v_q IS NOT NULL THEN
    v_pattern := '%' || replace(replace(v_q, '\', '\\'), '%', '\%') || '%';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      p.id,
      p.student_id,
      p.admin_id,
      p.type,
      p.amount,
      p.reason,
      p.is_auto,
      p.created_at,
      pr.name AS s_name,
      sp.seat_number AS s_seat,
      ap.name AS a_name
    FROM public.points p
    JOIN public.profiles pr ON pr.id = p.student_id
    LEFT JOIN public.student_profiles sp ON sp.id = p.student_id
    LEFT JOIN public.profiles ap ON ap.id = p.admin_id
    WHERE (p_type IS NULL OR p.type = p_type)
      AND (p_student_id IS NULL OR p.student_id = p_student_id)
      AND (
        v_pattern IS NULL
        OR p.reason ILIKE v_pattern
        OR pr.name ILIKE v_pattern
      )
  )
  SELECT
    f.id,
    f.student_id,
    f.admin_id,
    f.type,
    f.amount,
    f.reason,
    f.is_auto,
    f.created_at,
    f.s_name,
    f.s_seat,
    f.a_name,
    COUNT(*) OVER ()::bigint AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN p_sort = 'created_at' AND p_dir = 'asc'  THEN f.created_at END ASC,
    CASE WHEN p_sort = 'created_at' AND p_dir = 'desc' THEN f.created_at END DESC,
    CASE WHEN p_sort = 'amount'     AND p_dir = 'asc'  THEN f.amount     END ASC,
    CASE WHEN p_sort = 'amount'     AND p_dir = 'desc' THEN f.amount     END DESC,
    f.id
  LIMIT p_limit OFFSET p_offset;
END $$;

GRANT EXECUTE ON FUNCTION public.search_points_history(text, text, uuid, text, text, int, int)
  TO authenticated;

COMMENT ON FUNCTION public.search_points_history(text, text, uuid, text, text, int, int) IS
  '상벌점 내역 검색 (사유 OR 학생 이름). RLS 의존으로 branch 격리.';
