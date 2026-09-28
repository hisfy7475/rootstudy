-- 퇴원 후 재입반 시 상벌점 초기화
--
-- 배경 (2026-09 신준혁 학생 문의):
--   8/20 퇴원 → 9/23 재입반한 학생에게 퇴원 전 상점(+101)·벌점(-21)이 그대로 따라왔다.
--   재입반은 새 재원 기간이므로 상벌점을 0 에서 다시 시작해야 한다.
--
-- 설계 — "초기화 행 한 쌍 + 기준 시각":
--   1) points 원장에 event_kind='reset_on_reenroll' 행을 상점·벌점 각각 1행 넣어
--      평생 합계(잔여 상점·누적 벌점)를 0 으로 만든다. 과거 내역은 지우지 않고 보존.
--      → 평생 합계를 쓰는 모든 화면·함수(잔여 상점, 상품권 자동 발급, 누적 벌점)는 수정 없이 맞는다.
--   2) student_profiles.points_reset_at 에 초기화 시각을 남긴다.
--      분기 벌점(30점 판정)·상계 1회 제한("재원 중 1회")은 이 시각 이후 행만 센다.
--      초기화 행 자체는 분기 합계에서 제외한다 — 넣으면 퇴원 전 분기 밖 벌점까지 빼서
--      재입반 후 새 벌점이 음수에 흡수된다.
--   3) 초기화 이전 행은 취소·삭제 금지 — 지우면 평생 합계가 초기화 행과 어긋난다.

-- =============================================
-- 1. 기준 시각 컬럼
-- =============================================
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS points_reset_at timestamptz;

COMMENT ON COLUMN public.student_profiles.points_reset_at IS
  '재입반으로 상벌점을 초기화한 시각. 분기 벌점·상계 1회 제한은 이 시각 이후 행만 센다. NULL = 초기화 이력 없음.';

-- =============================================
-- 2. event_kind 부호 CHECK — reset_on_reenroll 은 0 이 아니면 허용
--    (평생 합계가 음수인 드문 경우엔 양수 행으로 0 을 맞춘다)
-- =============================================
ALTER TABLE public.points
  DROP CONSTRAINT IF EXISTS points_event_kind_amount_sign;

ALTER TABLE public.points
  ADD CONSTRAINT points_event_kind_amount_sign CHECK (
    (event_kind = 'reset_on_reenroll' AND amount <> 0)
    OR
    (event_kind IN ('reset_on_threshold', 'redeem', 'manual_cancel', 'offset_against_penalty') AND amount < 0)
    OR
    (event_kind NOT IN ('reset_on_reenroll', 'reset_on_threshold', 'redeem', 'manual_cancel', 'offset_against_penalty') AND amount > 0)
  );

COMMENT ON COLUMN public.points.event_kind IS
  'manual | manual_cancel | auto_weekly | auto_daily_focus | auto_vocab | auto_mentoring | auto_late | auto_early | reset_on_threshold | reset_on_threshold_revert | redeem | offset_against_penalty | offset_against_penalty_revert | reset_on_reenroll';

-- =============================================
-- 3. 초기화 RPC
-- =============================================
CREATE OR REPLACE FUNCTION public.reset_points_on_reenroll(
  p_student_id uuid,
  p_admin_id uuid DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid;
  v_allowed boolean := false;
  v_now timestamptz := now();
  v_reward int;
  v_penalty int;
  v_reason text;
  v_cleanup jsonb;
BEGIN
  -- service_role(auth.uid() NULL) 또는 같은 지점 관리자·최고 관리자만
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    v_allowed := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = v_caller AND me.user_type = 'admin'
      AND (me.is_super_admin OR EXISTS (
        SELECT 1 FROM public.profiles s WHERE s.id = p_student_id AND s.branch_id = me.branch_id))
  ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'permission denied: reset_points_on_reenroll' USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1 FROM public.student_profiles WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_a_student'); END IF;

  PERFORM 1 FROM public.points WHERE student_id = p_student_id FOR UPDATE;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE type = 'reward'), 0),
    COALESCE(SUM(amount) FILTER (WHERE type = 'penalty'), 0)
  INTO v_reward, v_penalty
  FROM public.points WHERE student_id = p_student_id;

  v_reason := COALESCE(NULLIF(btrim(p_reason), ''), '재입반으로 상벌점 초기화');

  IF v_reward <> 0 THEN
    INSERT INTO public.points (student_id, admin_id, type, amount, reason, is_auto, event_kind, created_at)
    VALUES (p_student_id, p_admin_id, 'reward', -v_reward, v_reason, false, 'reset_on_reenroll', v_now);
  END IF;

  IF v_penalty <> 0 THEN
    INSERT INTO public.points (student_id, admin_id, type, amount, reason, is_auto, event_kind, created_at)
    VALUES (p_student_id, p_admin_id, 'penalty', -v_penalty, v_reason, false, 'reset_on_reenroll', v_now);
  END IF;

  -- 퇴원 검토·강제 퇴원 분류, 단계 경고, 상계 소진 등 재원 기간 상태도 함께 비운다
  UPDATE public.student_profiles
  SET points_reset_at = v_now,
      withdrawal_review_at = NULL,
      withdrawal_review_reason = NULL,
      withdrawal_required_at = NULL,
      withdrawal_required_reason = NULL,
      withdrawal_notified_at = NULL,
      withdrawal_dismissed_at = NULL,
      withdrawal_dismissed_reason = NULL,
      withdrawal_dismissed_net = NULL,
      threshold_consumed_in_quarter_at = NULL,
      penalty_offset_in_quarter_total = 0,
      last_warned_at_10 = NULL,
      last_warned_at_20 = NULL,
      last_warned_at_25 = NULL
  WHERE id = p_student_id;

  -- 잔액 0 → 대기 중인 자동 상품권 슬롯 취소
  v_cleanup := public.cleanup_redemption_slots(p_student_id);

  RETURN jsonb_build_object(
    'status', 'reset',
    'reset_at', v_now,
    'reward_cleared', v_reward,
    'penalty_cleared', v_penalty,
    'cancelled_redemptions', COALESCE((v_cleanup->>'cancelled')::int, 0)
  );
END $function$;

REVOKE ALL ON FUNCTION public.reset_points_on_reenroll(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reset_points_on_reenroll(uuid, uuid, text) TO authenticated, service_role;

-- =============================================
-- 4. penalty_quarter_state_internal — 초기화 이후만 집계
-- =============================================
CREATE OR REPLACE FUNCTION public.penalty_quarter_state_internal(p_student_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_quarter_start timestamptz;
  v_reset_at timestamptz;
  v_from timestamptz;
  v_scope text;
  v_net int;
  v_offset int;
  v_offset_events int;
  v_revert_events int;
BEGIN
  v_quarter_start := public.get_current_quarter_start_kst();
  v_scope := public.points_offset_limit_scope();

  SELECT points_reset_at INTO v_reset_at FROM public.student_profiles WHERE id = p_student_id;
  v_from := GREATEST(v_quarter_start, COALESCE(v_reset_at, '-infinity'::timestamptz));

  SELECT COALESCE(SUM(amount), 0) INTO v_net
  FROM public.points
  WHERE student_id = p_student_id AND type = 'penalty'
    AND event_kind <> 'reset_on_reenroll'
    AND created_at >= v_from;

  SELECT COALESCE(-SUM(amount), 0) INTO v_offset
  FROM public.points
  WHERE student_id = p_student_id AND type = 'penalty'
    AND event_kind IN ('offset_against_penalty', 'offset_against_penalty_revert')
    AND created_at >= v_from;

  -- 'lifetime' = 재원 기간 1회 → 재입반(초기화) 이후만 센다
  SELECT
    count(*) FILTER (WHERE event_kind = 'offset_against_penalty'),
    count(*) FILTER (WHERE event_kind = 'offset_against_penalty_revert')
  INTO v_offset_events, v_revert_events
  FROM public.points
  WHERE student_id = p_student_id AND type = 'penalty'
    AND event_kind IN ('offset_against_penalty', 'offset_against_penalty_revert')
    AND created_at >= CASE WHEN v_scope = 'lifetime'
                           THEN COALESCE(v_reset_at, '-infinity'::timestamptz)
                           ELSE v_from END;

  RETURN jsonb_build_object(
    'quarter_start', v_quarter_start,
    'counted_from', v_from,
    'net', GREATEST(0, v_net),
    'net_raw', v_net,
    'offset', v_offset,
    'raw', GREATEST(0, v_net) + v_offset,
    'offset_consumed', COALESCE(v_offset_events, 0) > COALESCE(v_revert_events, 0),
    'limit_scope', v_scope
  );
END $function$;

-- =============================================
-- 5. points_summary — 초기화 이후 행만 집계 (누적 획득·사용 내역도 새 재원 기준)
-- =============================================
CREATE OR REPLACE FUNCTION public.points_summary(p_branch_id uuid)
 RETURNS TABLE(student_id uuid, reward_total integer, penalty_total integer, net_total integer, reward_lifetime integer, reward_redeemed integer, reward_burnt integer, reward_offset integer, penalty_quarter integer, penalty_quarter_raw integer, penalty_offset_quarter integer, penalty_quarter_net integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT sp.id, sp.points_reset_at
    FROM public.student_profiles sp
    JOIN public.profiles p ON p.id = sp.id
    WHERE (p_branch_id IS NULL OR p.branch_id = p_branch_id)
      AND p.withdrawn_at IS NULL
  ),
  agg AS (
    SELECT
      bs.id AS sid,
      COALESCE(SUM(CASE WHEN pt.type = 'reward' THEN pt.amount ELSE 0 END), 0)::int AS reward_total,
      COALESCE(SUM(CASE WHEN pt.type = 'penalty' THEN pt.amount ELSE 0 END), 0)::int AS penalty_total,
      COALESCE(SUM(CASE WHEN pt.type = 'reward' THEN pt.amount
                        WHEN pt.type = 'penalty' THEN -pt.amount ELSE 0 END), 0)::int AS net_total,
      COALESCE(SUM(CASE WHEN pt.type = 'reward'
                         AND pt.event_kind NOT IN (
                               'redeem','reset_on_threshold','reset_on_threshold_revert',
                               'manual_cancel','offset_against_penalty','offset_against_penalty_revert')
                        THEN pt.amount ELSE 0 END), 0)::int AS reward_lifetime,
      COALESCE(SUM(CASE WHEN pt.event_kind = 'redeem' THEN -pt.amount ELSE 0 END), 0)::int AS reward_redeemed,
      COALESCE(SUM(CASE WHEN pt.event_kind = 'reset_on_threshold' THEN -pt.amount ELSE 0 END), 0)::int AS reward_burnt,
      COALESCE(SUM(CASE WHEN pt.type = 'reward' AND pt.event_kind = 'offset_against_penalty'
                        THEN -pt.amount ELSE 0 END), 0)::int AS reward_offset,
      COALESCE(SUM(CASE WHEN pt.type = 'penalty' AND pt.created_at >= v_q_start
                        THEN pt.amount ELSE 0 END), 0)::int AS q_net,
      COALESCE(SUM(CASE WHEN pt.type = 'penalty'
                         AND pt.event_kind IN ('offset_against_penalty','offset_against_penalty_revert')
                         AND pt.created_at >= v_q_start
                        THEN -pt.amount ELSE 0 END), 0)::int AS q_offset
    FROM branch_students bs
    LEFT JOIN public.points pt
      ON pt.student_id = bs.id
     AND pt.event_kind <> 'reset_on_reenroll'
     AND (bs.points_reset_at IS NULL OR pt.created_at >= bs.points_reset_at)
    GROUP BY bs.id
  )
  SELECT
    a.sid,
    a.reward_total,
    a.penalty_total,
    a.net_total,
    a.reward_lifetime,
    a.reward_redeemed,
    a.reward_burnt,
    a.reward_offset,
    (GREATEST(0, a.q_net) + a.q_offset)::int AS penalty_quarter,
    (GREATEST(0, a.q_net) + a.q_offset)::int AS penalty_quarter_raw,
    a.q_offset AS penalty_offset_quarter,
    GREATEST(0, a.q_net)::int AS penalty_quarter_net
  FROM agg a;
END $function$;

-- =============================================
-- 6. cancel_point — 초기화 행·초기화 이전 행 취소 금지
-- =============================================
CREATE OR REPLACE FUNCTION public.cancel_point(p_point_id uuid, p_admin_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid;
  v_original record;
  v_reset_at timestamptz;
  v_total_after_net int := NULL;
  v_offset_revert jsonb := NULL;
  v_review_revert_result jsonb := NULL;
  v_cleanup_result jsonb := NULL;
BEGIN
  SELECT student_id INTO v_student_id FROM public.points WHERE id = p_point_id;
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  SELECT points_reset_at INTO v_reset_at
  FROM public.student_profiles WHERE id = v_student_id FOR UPDATE;

  SELECT * INTO v_original FROM public.points WHERE id = p_point_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_original.event_kind IN (
    'reset_on_threshold', 'reset_on_threshold_revert',
    'redeem', 'manual_cancel', 'auto_daily_focus',
    'offset_against_penalty', 'offset_against_penalty_revert',
    'reset_on_reenroll'
  ) THEN
    RETURN jsonb_build_object('status', 'protected', 'event_kind', v_original.event_kind);
  END IF;

  IF v_reset_at IS NOT NULL AND v_original.created_at < v_reset_at THEN
    RETURN jsonb_build_object('status', 'before_reset', 'reset_at', v_reset_at);
  END IF;

  INSERT INTO public.points (
    student_id, admin_id, type, amount, reason, is_auto, event_kind
  ) VALUES (
    v_original.student_id, p_admin_id, v_original.type,
    -v_original.amount,
    COALESCE(p_reason, v_original.reason || ' (취소)'),
    false, 'manual_cancel'
  );

  IF v_original.type = 'penalty' THEN
    v_offset_revert := public.maybe_revert_penalty_offset(v_original.student_id);

    v_total_after_net := (public.penalty_quarter_state_internal(v_original.student_id)->>'net')::int;

    IF v_total_after_net < 30 THEN
      v_review_revert_result := public.cancel_withdrawal_review(v_original.student_id, true);
    END IF;
  END IF;

  IF v_original.type = 'reward' THEN
    v_cleanup_result := public.cleanup_redemption_slots(v_original.student_id);
  END IF;

  RETURN jsonb_build_object(
    'status', 'cancelled',
    'original_id', v_original.id,
    'quarter_total_after', v_total_after_net,
    'offset_revert', v_offset_revert,
    'review_revert', v_review_revert_result,
    'cleanup', v_cleanup_result
  );
END $function$;

-- =============================================
-- 7. 하드 삭제 보호 — 초기화 행·초기화 이전 행
-- =============================================
CREATE OR REPLACE FUNCTION public.protect_points_event_kind_delete()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_reset_at timestamptz;
BEGIN
  IF OLD.event_kind IN (
    'reset_on_threshold',
    'reset_on_threshold_revert',
    'redeem',
    'manual_cancel',
    'auto_daily_focus',
    'auto_vocab',
    'offset_against_penalty',
    'offset_against_penalty_revert',
    'reset_on_reenroll'
  ) THEN
    RAISE EXCEPTION 'points 행은 event_kind=% 라 삭제할 수 없습니다. cancel_point RPC 로 취소 행 INSERT 하세요. (id=%)',
      OLD.event_kind, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 학생 행이 함께 삭제되는 CASCADE 에서는 조회 결과가 없어 통과한다
  SELECT points_reset_at INTO v_reset_at FROM public.student_profiles WHERE id = OLD.student_id;
  IF v_reset_at IS NOT NULL AND OLD.created_at < v_reset_at THEN
    RAISE EXCEPTION '재입반 초기화 이전 상벌점 내역은 삭제할 수 없습니다. (id=%)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN OLD;
END;
$function$;
