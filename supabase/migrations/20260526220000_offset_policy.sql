-- 정책 변경: 분기 누적 벌점 30점 도달 시 1:1 상계
--
-- 변경 요약:
-- - 30점 도달 시 보유 상점 전액 소멸 → 1:1 상계 (작은 값 기준 양쪽 동시 차감)
-- - 가용 상점 0 인 상태에서 30점 도달 시 → 강제 퇴원 대상 자동 마크
-- - 잔존 벌점은 분기 누적 유지 (동일 분기 내 추가 적립으로 30점 재도달 시 동일 프로세스)
-- - 상품권 발급 대기(`requested` + `auto_pending`)는 보호 유지
-- - 강제 퇴원 실행은 어드민이 수동 (시스템은 표시만)
-- - 분기 시작 시 잔존 벌점·상계 누계·강제 퇴원 마크 모두 초기화
--
-- 신규 구조:
-- - student_profiles.withdrawal_required_at         — 강제 퇴원 대상 마크 시각
-- - student_profiles.withdrawal_required_reason     — 마크 사유
-- - student_profiles.penalty_offset_in_quarter_total — 분기 내 상계 누계 (net 분기 누적 = raw SUM − 이 값)
-- - points.event_kind 'offset_against_penalty'      — 상계 시 음수 reward 행
-- - points.event_kind 'offset_against_penalty_revert' — 상계 취소 시 양수 reward 행 (선택)
--
-- 호환성:
-- - `withdrawal_review_at`/`threshold_consumed_in_quarter_at` 컬럼은 유지 (기존 검토 진입 학생 데이터 보존)
-- - `reset_on_threshold`/`reset_on_threshold_revert` event_kind 도 유지 (기존 이력 표시용)
-- - `request_redemption`은 이미 비활성화 상태 (20260526180000_auto_redemption_threshold_100.sql)

-- =============================================
-- 1. student_profiles 신규 컬럼
-- =============================================
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS withdrawal_required_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS withdrawal_required_reason text NULL,
  ADD COLUMN IF NOT EXISTS penalty_offset_in_quarter_total int NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_student_profiles_withdrawal_required
  ON public.student_profiles (withdrawal_required_at)
  WHERE withdrawal_required_at IS NOT NULL;

COMMENT ON COLUMN public.student_profiles.withdrawal_required_at IS
  '신규 정책: 30점 도달 시점에 가용 상점이 0 이어서 강제 퇴원 대상으로 자동 마크된 시각.';
COMMENT ON COLUMN public.student_profiles.withdrawal_required_reason IS
  '강제 퇴원 대상 마크 사유 텍스트.';
COMMENT ON COLUMN public.student_profiles.penalty_offset_in_quarter_total IS
  '신규 정책: 현재 분기 안에서 상점과 상계된 벌점 누계. 분기 시작 시 quarterly-reset 크론이 0 으로 리셋.';

-- =============================================
-- 2. points.event_kind CHECK 제약 갱신
-- =============================================
-- 음수 amount 허용 목록에 'offset_against_penalty' 추가.
-- 'offset_against_penalty_revert' 는 양수(reward 복구)라 음수 목록 변경 불필요.
ALTER TABLE public.points
  DROP CONSTRAINT IF EXISTS points_event_kind_amount_sign;

ALTER TABLE public.points
  ADD CONSTRAINT points_event_kind_amount_sign CHECK (
    (event_kind IN ('reset_on_threshold', 'redeem', 'manual_cancel', 'offset_against_penalty') AND amount < 0)
    OR
    (event_kind NOT IN ('reset_on_threshold', 'redeem', 'manual_cancel', 'offset_against_penalty') AND amount > 0)
  );

COMMENT ON COLUMN public.points.event_kind IS
  'manual | manual_cancel | auto_weekly | auto_daily_focus | auto_late | auto_early | reset_on_threshold | reset_on_threshold_revert | redeem | offset_against_penalty | offset_against_penalty_revert';

-- =============================================
-- 3. handle_penalty_threshold — 상계 로직으로 재작성
-- =============================================
-- 원본: 20260520001000_threshold_rpcs.sql:25-95 (상점 전액 소멸 정책)
-- 신규: 1:1 상계 + 가용 상점 0 시 강제 퇴원 대상 마크
--
-- 트랜잭션 경계:
-- - student_profiles 행 FOR UPDATE (race 방지)
-- - points 행 FOR UPDATE (잔액 일관성)
CREATE OR REPLACE FUNCTION public.handle_penalty_threshold(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quarter_start timestamptz;
  v_balance int;
  v_queue_count int;
  v_protected int;
  v_available int;
  v_penalty_raw int;
  v_penalty_offset_prev int;
  v_penalty_net int;
  v_offset int;
BEGIN
  v_quarter_start := public.get_current_quarter_start_kst();

  -- 학생별 직렬화 (동시 30점 통과 race 방지)
  PERFORM 1 FROM public.student_profiles WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_a_student');
  END IF;

  -- points 행 락 (잔액·분기 누적 일관성)
  PERFORM 1 FROM public.points WHERE student_id = p_student_id FOR UPDATE;

  -- 상점 잔액 (음수 행 포함 합산)
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.points
  WHERE student_id = p_student_id AND type = 'reward';

  -- 보호 대상 큐 (requested + auto_pending) — 두 종류 모두 보호
  SELECT COUNT(*) INTO v_queue_count
  FROM public.reward_redemptions
  WHERE student_id = p_student_id AND status IN ('requested', 'auto_pending');

  v_protected := v_queue_count * 100;
  v_available := GREATEST(0, v_balance - v_protected);

  -- 분기 누적 벌점 (net = raw SUM − 이미 상계된 누계)
  SELECT COALESCE(SUM(amount), 0) INTO v_penalty_raw
  FROM public.points
  WHERE student_id = p_student_id
    AND type = 'penalty'
    AND created_at >= v_quarter_start;

  SELECT penalty_offset_in_quarter_total INTO v_penalty_offset_prev
  FROM public.student_profiles WHERE id = p_student_id;

  v_penalty_net := v_penalty_raw - v_penalty_offset_prev;

  -- 상계 금액 = MIN(가용 상점, 잔존 분기 벌점)
  v_offset := LEAST(v_available, v_penalty_net);

  IF v_offset > 0 THEN
    -- 1:1 상계: 음수 reward 행 INSERT + offset 누계 갱신
    INSERT INTO public.points (student_id, admin_id, type, amount, reason, is_auto, event_kind)
    VALUES (p_student_id, NULL, 'reward', -v_offset,
            '벌점 30점 도달로 상점 1:1 상계', true, 'offset_against_penalty');

    UPDATE public.student_profiles
    SET penalty_offset_in_quarter_total = penalty_offset_in_quarter_total + v_offset
    WHERE id = p_student_id;

    RETURN jsonb_build_object(
      'status', 'offset',
      'offset_amount', v_offset,
      'reward_after', v_balance - v_offset,
      'penalty_after_net', v_penalty_net - v_offset,
      'will_require_withdrawal', false,
      'protected_queue_count', v_queue_count
    );
  ELSE
    -- 가용 상점 0 → 강제 퇴원 대상 마크
    UPDATE public.student_profiles
    SET withdrawal_required_at = COALESCE(withdrawal_required_at, now()),
        withdrawal_required_reason = COALESCE(
          withdrawal_required_reason,
          '벌점 30점 도달 시점 가용 상점 0 (' ||
          to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') || ')'
        )
    WHERE id = p_student_id;

    RETURN jsonb_build_object(
      'status', 'withdrawal_required',
      'offset_amount', 0,
      'reward_after', v_balance,
      'penalty_after_net', v_penalty_net,
      'will_require_withdrawal', true,
      'protected_queue_count', v_queue_count
    );
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.handle_penalty_threshold(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.handle_penalty_threshold(uuid) IS
  '신규 정책 (2026-05): 분기 벌점 30점 도달 시 1:1 상계. 가용 상점 0 이면 강제 퇴원 대상 마크. 단일 트랜잭션 + student 행 락.';

-- =============================================
-- 4. give_penalty_with_threshold_check — net 누적 기준으로 판정
-- =============================================
CREATE OR REPLACE FUNCTION public.give_penalty_with_threshold_check(
  p_student_id uuid,
  p_admin_id uuid,
  p_amount int,
  p_reason text,
  p_preset_id uuid DEFAULT NULL,
  p_event_kind text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quarter_start timestamptz;
  v_penalty_raw_before int;
  v_offset_prev int;
  v_total_before_net int;
  v_total_after_net int;
  v_threshold_result jsonb := NULL;
  v_warnings jsonb := '[]'::jsonb;
  v_point_id uuid;
BEGIN
  v_quarter_start := public.get_current_quarter_start_kst();

  -- 학생 행 직렬화 (race 방지)
  PERFORM 1 FROM public.student_profiles WHERE id = p_student_id FOR UPDATE;

  -- 부여 전 net 분기 누적
  SELECT COALESCE(SUM(amount), 0) INTO v_penalty_raw_before
  FROM public.points
  WHERE student_id = p_student_id
    AND type = 'penalty'
    AND created_at >= v_quarter_start;

  SELECT penalty_offset_in_quarter_total INTO v_offset_prev
  FROM public.student_profiles WHERE id = p_student_id;

  v_total_before_net := v_penalty_raw_before - v_offset_prev;

  -- 벌점 행 INSERT (uq_points_daily_preset 충돌 시 23505 raise)
  INSERT INTO public.points (
    student_id, admin_id, type, amount, reason,
    is_auto, preset_id, preset_type, event_kind
  )
  VALUES (
    p_student_id, p_admin_id, 'penalty', p_amount, p_reason,
    (p_event_kind LIKE 'auto_%'),
    p_preset_id,
    CASE WHEN p_preset_id IS NOT NULL THEN 'penalty' ELSE NULL END,
    p_event_kind
  )
  RETURNING id INTO v_point_id;

  v_total_after_net := v_total_before_net + p_amount;

  -- 단계 알림 dedupe (CAS UPDATE) — 같은 분기에 한 번만
  IF v_total_after_net >= 10 AND v_total_before_net < 10 THEN
    UPDATE public.student_profiles SET last_warned_at_10 = now()
    WHERE id = p_student_id
      AND (last_warned_at_10 IS NULL OR last_warned_at_10 < v_quarter_start);
    IF FOUND THEN v_warnings := v_warnings || '"warn_10"'::jsonb; END IF;
  END IF;

  IF v_total_after_net >= 20 AND v_total_before_net < 20 THEN
    UPDATE public.student_profiles SET last_warned_at_20 = now()
    WHERE id = p_student_id
      AND (last_warned_at_20 IS NULL OR last_warned_at_20 < v_quarter_start);
    IF FOUND THEN v_warnings := v_warnings || '"warn_20"'::jsonb; END IF;
  END IF;

  IF v_total_after_net >= 25 AND v_total_before_net < 25 THEN
    UPDATE public.student_profiles SET last_warned_at_25 = now()
    WHERE id = p_student_id
      AND (last_warned_at_25 IS NULL OR last_warned_at_25 < v_quarter_start);
    IF FOUND THEN v_warnings := v_warnings || '"warn_25"'::jsonb; END IF;
  END IF;

  -- 30점 통과 → 상계/강제 퇴원 트리거
  IF v_total_after_net >= 30 AND v_total_before_net < 30 THEN
    v_threshold_result := public.handle_penalty_threshold(p_student_id);
  END IF;

  RETURN jsonb_build_object(
    'point_id', v_point_id,
    'total_before', v_total_before_net,
    'total_after', v_total_after_net,
    'warnings', v_warnings,
    'threshold', v_threshold_result
  );
END $$;

GRANT EXECUTE ON FUNCTION public.give_penalty_with_threshold_check(uuid, uuid, int, text, uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.give_penalty_with_threshold_check(uuid, uuid, int, text, uuid, text) IS
  '신규 정책: 벌점 부여 + net 누적(raw − offset) 기준 단계 알림 dedupe + 30점 통과 시 1:1 상계 트리거. student_profiles 행 FOR UPDATE 직렬화.';

-- =============================================
-- 5. cancel_withdrawal_review — withdrawal_required_at 통합 처리
-- =============================================
-- 원본: 20260526180000_auto_redemption_threshold_100.sql:220-281
-- 변경:
-- - withdrawal_review_at(구 정책) 또는 withdrawal_required_at(신규) 둘 다 NULL 처리
-- - 구 정책의 reset_on_threshold 복구 로직 유지 (기존 검토 진입 학생 데이터 보호)
-- - 신규 정책의 상계 자체는 되돌리지 않음 (회계 사실로 보존)
-- - 신규 정책 케이스에서는 v_burnt_amount = 0 이므로 자연 노옵
CREATE OR REPLACE FUNCTION public.cancel_withdrawal_review(
  p_student_id uuid,
  p_restore_reward boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consumed_at timestamptz;
  v_review_at timestamptz;
  v_required_at timestamptz;
  v_burnt_amount int := 0;
  v_cancelled_pending int := 0;
  v_ensure_result jsonb;
BEGIN
  PERFORM 1 FROM public.student_profiles WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_a_student');
  END IF;

  SELECT withdrawal_review_at, withdrawal_required_at, threshold_consumed_in_quarter_at
  INTO v_review_at, v_required_at, v_consumed_at
  FROM public.student_profiles WHERE id = p_student_id;

  IF v_review_at IS NULL AND v_required_at IS NULL THEN
    RETURN jsonb_build_object('status', 'not_in_review');
  END IF;

  UPDATE public.student_profiles
  SET withdrawal_review_at = NULL,
      withdrawal_review_reason = NULL,
      withdrawal_required_at = NULL,
      withdrawal_required_reason = NULL
  WHERE id = p_student_id;

  -- 구 정책: reset_on_threshold 행 합계만큼 복구 (기존 검토 진입 학생 보호)
  IF p_restore_reward AND v_consumed_at IS NOT NULL THEN
    SELECT COALESCE(SUM(-amount), 0) INTO v_burnt_amount
    FROM public.points
    WHERE student_id = p_student_id
      AND event_kind = 'reset_on_threshold'
      AND created_at >= public.get_current_quarter_start_kst();

    IF v_burnt_amount > 0 THEN
      INSERT INTO public.points (student_id, type, amount, reason, is_auto, event_kind)
      VALUES (p_student_id, 'reward', v_burnt_amount,
              '퇴원 검토 취소로 인한 상점 복구', true, 'reset_on_threshold_revert');
    END IF;

    UPDATE public.reward_redemptions
    SET status = 'cancelled_by_revert',
        rejected_at = now(),
        rejected_reason = '검토 취소'
    WHERE student_id = p_student_id AND status = 'auto_pending';
    GET DIAGNOSTICS v_cancelled_pending = ROW_COUNT;
  END IF;

  -- 잔액 복구 후 100점 자동 큐 정합 유지
  v_ensure_result := public.ensure_redemption_slots(p_student_id);

  RETURN jsonb_build_object(
    'status', 'cancelled',
    'cleared_review', v_review_at IS NOT NULL,
    'cleared_required', v_required_at IS NOT NULL,
    'restored_reward', v_burnt_amount,
    'cancelled_pending', v_cancelled_pending,
    'ensure_result', v_ensure_result
  );
END $$;

GRANT EXECUTE ON FUNCTION public.cancel_withdrawal_review(uuid, boolean)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.cancel_withdrawal_review(uuid, boolean) IS
  '검토/강제 퇴원 마크 해제. 구 정책 reset_on_threshold 복구 로직 유지, 신규 정책 상계 행은 보존.';

-- =============================================
-- 6. preview_penalty — 신규 필드 추가
-- =============================================
CREATE OR REPLACE FUNCTION public.preview_penalty(
  p_student_id uuid,
  p_amount int
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quarter_start timestamptz;
  v_penalty_raw int;
  v_offset_prev int;
  v_total_before_net int;
  v_total_after_net int;
  v_balance int;
  v_queue_count int;
  v_protected int;
  v_available int;
  v_offset_estimate int;
  v_reaches int[] := ARRAY[]::int[];
  v_will_require_withdrawal boolean := false;
BEGIN
  v_quarter_start := public.get_current_quarter_start_kst();

  SELECT COALESCE(SUM(amount), 0) INTO v_penalty_raw
  FROM public.points
  WHERE student_id = p_student_id
    AND type = 'penalty'
    AND created_at >= v_quarter_start;

  SELECT penalty_offset_in_quarter_total INTO v_offset_prev
  FROM public.student_profiles WHERE id = p_student_id;
  v_offset_prev := COALESCE(v_offset_prev, 0);

  v_total_before_net := v_penalty_raw - v_offset_prev;
  v_total_after_net := v_total_before_net + p_amount;

  IF v_total_after_net >= 10 AND v_total_before_net < 10 THEN v_reaches := array_append(v_reaches, 10); END IF;
  IF v_total_after_net >= 20 AND v_total_before_net < 20 THEN v_reaches := array_append(v_reaches, 20); END IF;
  IF v_total_after_net >= 25 AND v_total_before_net < 25 THEN v_reaches := array_append(v_reaches, 25); END IF;
  IF v_total_after_net >= 30 AND v_total_before_net < 30 THEN v_reaches := array_append(v_reaches, 30); END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.points
  WHERE student_id = p_student_id AND type = 'reward';

  SELECT COUNT(*) INTO v_queue_count
  FROM public.reward_redemptions
  WHERE student_id = p_student_id AND status IN ('requested', 'auto_pending');

  v_protected := v_queue_count * 100;
  v_available := GREATEST(0, v_balance - v_protected);

  -- 30점 통과 시점에만 상계 발생
  IF v_total_after_net >= 30 AND v_total_before_net < 30 THEN
    v_offset_estimate := LEAST(v_available, v_total_after_net);
    v_will_require_withdrawal := v_offset_estimate = 0;
  ELSE
    v_offset_estimate := 0;
  END IF;

  RETURN jsonb_build_object(
    'quarter_total_before', v_total_before_net,
    'quarter_total_after', v_total_after_net,
    'thresholds_reached', to_jsonb(v_reaches),
    'reaches_30', v_total_after_net >= 30 AND v_total_before_net < 30,
    'current_balance', v_balance,
    'queue_count', v_queue_count,
    -- 신규 필드
    'offset_estimate', v_offset_estimate,
    'reward_after_offset', v_balance - v_offset_estimate,
    'penalty_after_offset_net', v_total_after_net - v_offset_estimate,
    'will_require_withdrawal', v_will_require_withdrawal,
    -- 구 정책 호환용 (값 0)
    'protected_auto_pending', 0,
    'burnt_estimate', 0
  );
END $$;

GRANT EXECUTE ON FUNCTION public.preview_penalty(uuid, int) TO authenticated, service_role;

COMMENT ON FUNCTION public.preview_penalty(uuid, int) IS
  '신규 정책 dry-run: net 분기 누적·임계치·상계 예상·강제 퇴원 대상 여부. 구 burnt_estimate/protected_auto_pending 필드는 항상 0.';

-- =============================================
-- 7. ensure_redemption_slots — withdrawal_required_at 도 skip 조건에 추가
-- =============================================
-- 원본: 20260526180000_auto_redemption_threshold_100.sql:53-100
CREATE OR REPLACE FUNCTION public.ensure_redemption_slots(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review_at timestamptz;
  v_required_at timestamptz;
  v_balance int;
  v_queue_count int;
  v_deficit int;
BEGIN
  PERFORM 1 FROM public.student_profiles WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_a_student');
  END IF;

  SELECT withdrawal_review_at, withdrawal_required_at
  INTO v_review_at, v_required_at
  FROM public.student_profiles WHERE id = p_student_id;

  IF v_review_at IS NOT NULL OR v_required_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'skipped_in_review');
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.points
  WHERE student_id = p_student_id AND type = 'reward';

  SELECT COUNT(*) INTO v_queue_count
  FROM public.reward_redemptions
  WHERE student_id = p_student_id AND status IN ('requested', 'auto_pending');

  v_deficit := (v_balance / 100) - v_queue_count;

  IF v_deficit > 0 THEN
    INSERT INTO public.reward_redemptions (student_id, status, points_used, trigger)
    SELECT p_student_id, 'auto_pending', 100, 'auto_threshold_100'
    FROM generate_series(1, v_deficit);
  END IF;

  RETURN jsonb_build_object(
    'status', 'ensured',
    'balance', v_balance,
    'queue_before', v_queue_count,
    'created', GREATEST(0, v_deficit)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.ensure_redemption_slots(uuid)
  TO authenticated, service_role;

-- =============================================
-- 8. cancel_point — net 기준 판정 + withdrawal_required_at 함께 해제
-- =============================================
-- 원본: 20260526180000_auto_redemption_threshold_100.sql:289-355
-- 변경:
-- - 벌점 취소 후 자동 검토 해제 판정을 net 기준(raw − offset)으로 수행
-- - cancel_withdrawal_review 가 withdrawal_required_at 도 함께 처리하므로 별도 분기 불필요
-- - 상계 음수 reward 행(offset_against_penalty)은 cancel_point 가 보호 목록에 미포함 → 의도된 동작
--   (관리자가 잘못 부여한 벌점을 취소하면 net 누적 감소 → 자동 검토 해제)
CREATE OR REPLACE FUNCTION public.cancel_point(
  p_point_id uuid,
  p_admin_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original record;
  v_quarter_start timestamptz;
  v_penalty_raw_after int;
  v_offset_curr int;
  v_total_after_net int := NULL;
  v_review_revert_result jsonb := NULL;
  v_cleanup_result jsonb := NULL;
BEGIN
  SELECT * INTO v_original FROM public.points WHERE id = p_point_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_original.event_kind IN (
    'reset_on_threshold', 'reset_on_threshold_revert',
    'redeem', 'manual_cancel', 'auto_daily_focus',
    'offset_against_penalty', 'offset_against_penalty_revert'
  ) THEN
    RETURN jsonb_build_object('status', 'protected', 'event_kind', v_original.event_kind);
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
    v_quarter_start := public.get_current_quarter_start_kst();
    SELECT COALESCE(SUM(amount), 0) INTO v_penalty_raw_after
    FROM public.points
    WHERE student_id = v_original.student_id
      AND type = 'penalty'
      AND created_at >= v_quarter_start;

    SELECT penalty_offset_in_quarter_total INTO v_offset_curr
    FROM public.student_profiles WHERE id = v_original.student_id;
    v_offset_curr := COALESCE(v_offset_curr, 0);

    v_total_after_net := v_penalty_raw_after - v_offset_curr;

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
    'review_revert', v_review_revert_result,
    'cleanup', v_cleanup_result
  );
END $$;

GRANT EXECUTE ON FUNCTION public.cancel_point(uuid, uuid, text)
  TO authenticated, service_role;

-- =============================================
-- 9. points_summary — reward_offset 컬럼 추가
-- =============================================
-- 원본: 20260520000200_points_summary_v2.sql
-- 변경: reward_offset 컬럼 추가 (상계로 차감된 양). reward_burnt 의미 유지.
DROP FUNCTION IF EXISTS public.points_summary(uuid);

CREATE FUNCTION public.points_summary(p_branch_id uuid)
RETURNS TABLE (
  student_id uuid,
  reward_total int,
  penalty_total int,
  net_total int,
  reward_lifetime int,
  reward_redeemed int,
  reward_burnt int,
  reward_offset int,      -- 신규: 상계로 차감된 상점 (절대값)
  penalty_quarter int
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
                       AND pt.event_kind NOT IN ('redeem','reset_on_threshold','manual_cancel','offset_against_penalty')
                      THEN pt.amount ELSE 0 END), 0)::int AS reward_lifetime,
    COALESCE(SUM(CASE WHEN pt.event_kind = 'redeem' THEN -pt.amount ELSE 0 END), 0)::int AS reward_redeemed,
    COALESCE(SUM(CASE WHEN pt.event_kind = 'reset_on_threshold' THEN -pt.amount ELSE 0 END), 0)::int AS reward_burnt,
    COALESCE(SUM(CASE WHEN pt.event_kind = 'offset_against_penalty' THEN -pt.amount ELSE 0 END), 0)::int AS reward_offset,
    COALESCE(SUM(CASE WHEN pt.type = 'penalty' AND pt.created_at >= v_q_start
                      THEN pt.amount ELSE 0 END), 0)::int AS penalty_quarter
  FROM branch_students bs
  LEFT JOIN public.points pt ON pt.student_id = bs.id
  GROUP BY bs.id;
END $$;

GRANT EXECUTE ON FUNCTION public.points_summary(uuid) TO authenticated;

COMMENT ON FUNCTION public.points_summary(uuid) IS
  '지점 학생 상벌점 집계. reward_total = 현재 잔액(음수 행 포함). reward_burnt(30점 도달 소멸), reward_offset(1:1 상계) 분해. penalty_quarter = KST 현재 분기 누적(raw, offset 차감 전).';
