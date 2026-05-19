-- 항목 1·3·4 (BLOCKER): points_summary RPC 음수 amount 호환 + 분기 누적 컬럼 추가
--
-- 변경 요약:
-- - 음수 amount 행(reset_on_threshold/redeem/manual_cancel)이 추가됨에 따라
--   기존 reward_total 합계의 의미가 "누적"에서 "잔액"으로 자연스럽게 전환.
-- - 새 컬럼 추가:
--     reward_lifetime  — 양수 reward 만 합산 (총 획득)
--     reward_redeemed  — redeem 행의 절대값 합 (상품권 사용)
--     reward_burnt     — reset_on_threshold 행의 절대값 합 (30점 도달 소멸)
--     penalty_quarter  — 현재 KST 분기 안의 penalty 합
-- - 기존 컬럼(reward_total/penalty_total/net_total)은 column-position 호환 유지
--   하되 의미만 "현재 잔액 기준"으로 자연 전환.
--
-- 시그니처 변경(RETURNS TABLE 컬럼 추가)이 있어 CREATE OR REPLACE 불가 → DROP + CREATE.

DROP FUNCTION IF EXISTS public.points_summary(uuid);

CREATE FUNCTION public.points_summary(p_branch_id uuid)
RETURNS TABLE (
  student_id uuid,
  reward_total int,        -- 잔액 (음수 행 포함 합산)
  penalty_total int,       -- 전체 누적 벌점 (양수만)
  net_total int,           -- reward_total - penalty_total (현재 표시 net)
  reward_lifetime int,     -- 평생 획득 상점 (양수 reward 만)
  reward_redeemed int,     -- 상품권 발급으로 사용한 상점 (절대값)
  reward_burnt int,        -- 30점 도달로 소멸한 상점 (절대값)
  penalty_quarter int      -- 현재 KST 분기 안의 벌점 합
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_branch uuid;
  v_is_super boolean;
  v_q_start timestamptz;
BEGIN
  SELECT branch_id, is_super_admin
    INTO v_admin_branch, v_is_super
    FROM public.profiles
   WHERE id = auth.uid() AND user_type = 'admin';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'permission denied: admin only';
  END IF;
  IF NOT v_is_super THEN
    IF v_admin_branch IS NULL THEN
      RAISE EXCEPTION 'permission denied: admin without branch';
    END IF;
    IF p_branch_id IS NULL OR p_branch_id <> v_admin_branch THEN
      RAISE EXCEPTION 'permission denied: branch mismatch';
    END IF;
  END IF;

  v_q_start := public.get_current_quarter_start_kst();

  RETURN QUERY
  WITH branch_students AS (
    SELECT sp.id
    FROM public.student_profiles sp
    JOIN public.profiles p ON p.id = sp.id
    WHERE (p_branch_id IS NULL OR p.branch_id = p_branch_id)
      AND p.withdrawn_at IS NULL
  )
  SELECT
    bs.id,
    COALESCE(SUM(CASE WHEN pt.type = 'reward' THEN pt.amount ELSE 0 END), 0)::int AS reward_total,
    COALESCE(SUM(CASE WHEN pt.type = 'penalty' THEN pt.amount ELSE 0 END), 0)::int AS penalty_total,
    COALESCE(SUM(CASE WHEN pt.type = 'reward' THEN pt.amount
                      WHEN pt.type = 'penalty' THEN -pt.amount ELSE 0 END), 0)::int AS net_total,
    COALESCE(SUM(CASE WHEN pt.type = 'reward'
                       AND pt.event_kind NOT IN ('redeem','reset_on_threshold','manual_cancel')
                      THEN pt.amount ELSE 0 END), 0)::int AS reward_lifetime,
    COALESCE(SUM(CASE WHEN pt.event_kind = 'redeem' THEN -pt.amount ELSE 0 END), 0)::int AS reward_redeemed,
    COALESCE(SUM(CASE WHEN pt.event_kind = 'reset_on_threshold' THEN -pt.amount ELSE 0 END), 0)::int AS reward_burnt,
    COALESCE(SUM(CASE WHEN pt.type = 'penalty' AND pt.created_at >= v_q_start
                      THEN pt.amount ELSE 0 END), 0)::int AS penalty_quarter
  FROM branch_students bs
  LEFT JOIN public.points pt ON pt.student_id = bs.id
  GROUP BY bs.id;
END $$;

GRANT EXECUTE ON FUNCTION public.points_summary(uuid) TO authenticated;

COMMENT ON FUNCTION public.points_summary(uuid) IS
  '지점 학생들의 상벌점 집계. reward_total = 현재 잔액 (음수 행 포함). reward_lifetime/redeemed/burnt 분해. penalty_quarter = KST 현재 분기 누적.';
