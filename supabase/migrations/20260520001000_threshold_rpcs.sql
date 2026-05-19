-- 항목 1·2·4: Critical RPC 함수 6개
--
-- 1. handle_penalty_threshold(p_student_id)
--    30점 도달 처리: 보유 상점 전액 소멸 (auto_pending 보호 포함) + withdrawal_review_at 세팅
--    CAS UPDATE + points 행 락으로 동시성 안전
--
-- 2. give_penalty_with_threshold_check(p_student_id, p_admin_id, p_amount, p_reason, p_preset_id, p_event_kind)
--    벌점 부여 + 10/20/25점 단계 알림 dedupe + 30점 도달 트리거 호출
--
-- 3. cancel_withdrawal_review(p_student_id, p_restore_reward)
--    검토 취소 + 옵션으로 상점 복구 (reset_on_threshold_revert 행 INSERT)
--
-- 4. issue_redemption(p_redemption_id, p_admin_id, p_voucher_amount, p_voucher_code)
--    상품권 발급 + 잔액 검증 + points redeem 행 INSERT (한 트랜잭션)
--
-- 5. request_redemption(p_student_id)
--    학생 신청 + 가용 잔액 검증 + reward_redemptions INSERT
--
-- 6. preview_penalty(p_student_id, p_amount)
--    부여 전 dry-run: 분기 누적·임계치 도달·소멸 예상 잔액

-- =============================================
-- 1. handle_penalty_threshold
-- =============================================
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
  v_redeemable_slots int;
  v_remainder int;
BEGIN
  v_quarter_start := public.get_current_quarter_start_kst();

  -- 1. CAS UPDATE — 같은 분기에 이미 소멸 처리됐으면 skip
  UPDATE public.student_profiles
  SET threshold_consumed_in_quarter_at = now(),
      withdrawal_review_at = COALESCE(withdrawal_review_at, now()),
      withdrawal_review_reason = COALESCE(
        withdrawal_review_reason,
        '벌점 30점 도달 (' || to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') || ')'
      )
  WHERE id = p_student_id
    AND (
      threshold_consumed_in_quarter_at IS NULL
      OR threshold_consumed_in_quarter_at < v_quarter_start
    );

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'already_consumed_this_quarter');
  END IF;

  -- 2. points 행 락
  PERFORM 1 FROM public.points WHERE student_id = p_student_id FOR UPDATE;

  -- 3. 잔액 (모든 type='reward' 합산, 음수 행 포함)
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.points
  WHERE student_id = p_student_id AND type = 'reward';

  -- 4. 큐에 있는 redemption 건수
  SELECT COUNT(*) INTO v_queue_count
  FROM public.reward_redemptions
  WHERE student_id = p_student_id AND status IN ('requested', 'auto_pending');

  -- 5. 발급 가능 추가 횟수
  v_redeemable_slots := GREATEST(0, (v_balance / 100) - v_queue_count);

  -- 6. auto_pending K건 INSERT
  IF v_redeemable_slots > 0 THEN
    INSERT INTO public.reward_redemptions (student_id, status, points_used, trigger)
    SELECT p_student_id, 'auto_pending', 100, 'threshold_auto'
    FROM generate_series(1, v_redeemable_slots);
  END IF;

  -- 7. 잔여 소멸
  v_remainder := v_balance - (v_queue_count + v_redeemable_slots) * 100;
  IF v_remainder > 0 THEN
    INSERT INTO public.points (student_id, admin_id, type, amount, reason, is_auto, event_kind)
    VALUES (p_student_id, NULL, 'reward', -v_remainder,
            '분기 벌점 30점 도달로 상점 잔여 소멸', true, 'reset_on_threshold');
  END IF;

  RETURN jsonb_build_object(
    'status', 'consumed',
    'balance_before', v_balance,
    'auto_pending_created', v_redeemable_slots,
    'remainder_burnt', v_remainder
  );
END $$;

GRANT EXECUTE ON FUNCTION public.handle_penalty_threshold(uuid) TO authenticated, service_role;

-- =============================================
-- 2. give_penalty_with_threshold_check
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
  v_total_before int;
  v_total_after int;
  v_threshold_result jsonb := NULL;
  v_warnings jsonb := '[]'::jsonb;
  v_point_id uuid;
BEGIN
  v_quarter_start := public.get_current_quarter_start_kst();

  -- 1. 부여 전 분기 누적
  SELECT COALESCE(SUM(amount), 0) INTO v_total_before
  FROM public.points
  WHERE student_id = p_student_id
    AND type = 'penalty'
    AND created_at >= v_quarter_start;

  -- 2. 벌점 부여 (uq_points_daily_preset 충돌 시 23505 raise)
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

  v_total_after := v_total_before + p_amount;

  -- 3. 단계 알림 dedupe (CAS UPDATE) — 같은 분기에 한 번만
  IF v_total_after >= 10 AND v_total_before < 10 THEN
    UPDATE public.student_profiles SET last_warned_at_10 = now()
    WHERE id = p_student_id
      AND (last_warned_at_10 IS NULL OR last_warned_at_10 < v_quarter_start);
    IF FOUND THEN v_warnings := v_warnings || '"warn_10"'::jsonb; END IF;
  END IF;

  IF v_total_after >= 20 AND v_total_before < 20 THEN
    UPDATE public.student_profiles SET last_warned_at_20 = now()
    WHERE id = p_student_id
      AND (last_warned_at_20 IS NULL OR last_warned_at_20 < v_quarter_start);
    IF FOUND THEN v_warnings := v_warnings || '"warn_20"'::jsonb; END IF;
  END IF;

  IF v_total_after >= 25 AND v_total_before < 25 THEN
    UPDATE public.student_profiles SET last_warned_at_25 = now()
    WHERE id = p_student_id
      AND (last_warned_at_25 IS NULL OR last_warned_at_25 < v_quarter_start);
    IF FOUND THEN v_warnings := v_warnings || '"warn_25"'::jsonb; END IF;
  END IF;

  -- 4. 30점 도달 트리거
  IF v_total_after >= 30 AND v_total_before < 30 THEN
    v_threshold_result := public.handle_penalty_threshold(p_student_id);
  END IF;

  RETURN jsonb_build_object(
    'point_id', v_point_id,
    'total_before', v_total_before,
    'total_after', v_total_after,
    'warnings', v_warnings,
    'threshold', v_threshold_result
  );
END $$;

GRANT EXECUTE ON FUNCTION public.give_penalty_with_threshold_check(uuid, uuid, int, text, uuid, text)
  TO authenticated, service_role;

-- =============================================
-- 3. cancel_withdrawal_review
-- =============================================
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
  v_burnt_amount int := 0;
  v_cancelled_pending int := 0;
BEGIN
  -- CAS UPDATE — withdrawal_review_at 세팅된 행만 처리
  UPDATE public.student_profiles
  SET withdrawal_review_at = NULL,
      withdrawal_review_reason = NULL
  WHERE id = p_student_id AND withdrawal_review_at IS NOT NULL
  RETURNING threshold_consumed_in_quarter_at INTO v_consumed_at;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_in_review');
  END IF;

  IF p_restore_reward AND v_consumed_at IS NOT NULL THEN
    -- 같은 분기의 reset_on_threshold 합계만큼 복구
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

    -- 미발급 auto_pending 자동 cancel
    UPDATE public.reward_redemptions
    SET status = 'cancelled_by_revert',
        rejected_at = now(),
        rejected_reason = '검토 취소'
    WHERE student_id = p_student_id AND status = 'auto_pending';
    GET DIAGNOSTICS v_cancelled_pending = ROW_COUNT;
  END IF;

  -- threshold_consumed_in_quarter_at 은 그대로 유지 (같은 분기 재진입 방지)
  RETURN jsonb_build_object(
    'status', 'cancelled',
    'restored_reward', v_burnt_amount,
    'cancelled_pending', v_cancelled_pending
  );
END $$;

GRANT EXECUTE ON FUNCTION public.cancel_withdrawal_review(uuid, boolean)
  TO authenticated, service_role;

-- =============================================
-- 4. issue_redemption
-- =============================================
CREATE OR REPLACE FUNCTION public.issue_redemption(
  p_redemption_id uuid,
  p_admin_id uuid,
  p_voucher_amount int,
  p_voucher_code text,
  p_voucher_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_balance int;
BEGIN
  SELECT student_id INTO v_student_id
  FROM public.reward_redemptions
  WHERE id = p_redemption_id AND status IN ('requested', 'auto_pending')
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_pending');
  END IF;

  PERFORM 1 FROM public.points WHERE student_id = v_student_id FOR UPDATE;
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.points
  WHERE student_id = v_student_id AND type = 'reward';

  IF v_balance < 100 THEN
    UPDATE public.reward_redemptions
    SET status = 'rejected',
        rejected_at = now(),
        rejected_by = p_admin_id,
        rejected_reason = '잔액 부족 (시점 변동)'
    WHERE id = p_redemption_id;
    RETURN jsonb_build_object('status', 'rejected_insufficient', 'balance', v_balance);
  END IF;

  INSERT INTO public.points (student_id, type, amount, reason, is_auto, event_kind)
  VALUES (v_student_id, 'reward', -100,
          '상품권 발급 (코드 ' || p_voucher_code || ')', true, 'redeem');

  UPDATE public.reward_redemptions
  SET status = 'issued',
      issued_at = now(),
      issued_by = p_admin_id,
      voucher_amount = p_voucher_amount,
      voucher_code = p_voucher_code,
      voucher_note = p_voucher_note
  WHERE id = p_redemption_id;

  RETURN jsonb_build_object('status', 'issued', 'student_id', v_student_id);
END $$;

GRANT EXECUTE ON FUNCTION public.issue_redemption(uuid, uuid, int, text, text)
  TO authenticated, service_role;

-- =============================================
-- 5. request_redemption
-- =============================================
CREATE OR REPLACE FUNCTION public.request_redemption(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance int;
  v_queue_count int;
  v_available int;
  v_review_at timestamptz;
  v_redemption_id uuid;
BEGIN
  -- 본인 호출만
  IF auth.uid() IS DISTINCT FROM p_student_id THEN
    RAISE EXCEPTION 'permission denied: self only';
  END IF;

  SELECT withdrawal_review_at INTO v_review_at
  FROM public.student_profiles
  WHERE id = p_student_id;

  IF v_review_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'rejected_in_review');
  END IF;

  PERFORM 1 FROM public.points WHERE student_id = p_student_id FOR UPDATE;
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.points
  WHERE student_id = p_student_id AND type = 'reward';

  SELECT COUNT(*) INTO v_queue_count
  FROM public.reward_redemptions
  WHERE student_id = p_student_id AND status IN ('requested', 'auto_pending');

  v_available := v_balance - v_queue_count * 100;

  IF v_available < 100 THEN
    RETURN jsonb_build_object(
      'status', 'rejected_insufficient',
      'balance', v_balance,
      'queue', v_queue_count,
      'available', v_available
    );
  END IF;

  INSERT INTO public.reward_redemptions (student_id, status, points_used, trigger)
  VALUES (p_student_id, 'requested', 100, 'student_request')
  RETURNING id INTO v_redemption_id;

  RETURN jsonb_build_object('status', 'requested', 'redemption_id', v_redemption_id);
END $$;

GRANT EXECUTE ON FUNCTION public.request_redemption(uuid) TO authenticated;

-- =============================================
-- 6. preview_penalty
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
  v_total_before int;
  v_total_after int;
  v_balance int;
  v_queue_count int;
  v_reaches int[] := ARRAY[]::int[];
BEGIN
  v_quarter_start := public.get_current_quarter_start_kst();

  SELECT COALESCE(SUM(amount), 0) INTO v_total_before
  FROM public.points
  WHERE student_id = p_student_id
    AND type = 'penalty'
    AND created_at >= v_quarter_start;

  v_total_after := v_total_before + p_amount;

  IF v_total_after >= 10 AND v_total_before < 10 THEN v_reaches := array_append(v_reaches, 10); END IF;
  IF v_total_after >= 20 AND v_total_before < 20 THEN v_reaches := array_append(v_reaches, 20); END IF;
  IF v_total_after >= 25 AND v_total_before < 25 THEN v_reaches := array_append(v_reaches, 25); END IF;
  IF v_total_after >= 30 AND v_total_before < 30 THEN v_reaches := array_append(v_reaches, 30); END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.points
  WHERE student_id = p_student_id AND type = 'reward';

  SELECT COUNT(*) INTO v_queue_count
  FROM public.reward_redemptions
  WHERE student_id = p_student_id AND status IN ('requested', 'auto_pending');

  RETURN jsonb_build_object(
    'quarter_total_before', v_total_before,
    'quarter_total_after', v_total_after,
    'thresholds_reached', to_jsonb(v_reaches),
    'reaches_30', v_total_after >= 30 AND v_total_before < 30,
    'current_balance', v_balance,
    'queue_count', v_queue_count,
    'protected_auto_pending', LEAST(GREATEST(v_balance / 100 - v_queue_count, 0),
                                    GREATEST(v_balance / 100, 0)),
    'burnt_estimate', GREATEST(v_balance - (v_balance / 100) * 100, 0) + 0
  );
END $$;

GRANT EXECUTE ON FUNCTION public.preview_penalty(uuid, int) TO authenticated, service_role;

COMMENT ON FUNCTION public.handle_penalty_threshold(uuid) IS
  '30점 도달 처리: 상점 잔액 소멸 + auto_pending 보호 + withdrawal_review_at 세팅. 분기당 1회.';
COMMENT ON FUNCTION public.give_penalty_with_threshold_check(uuid, uuid, int, text, uuid, text) IS
  '벌점 부여 + 10/20/25점 알림 dedupe + 30점 도달 트리거. 단일 트랜잭션.';
COMMENT ON FUNCTION public.cancel_withdrawal_review(uuid, boolean) IS
  '퇴원 검토 취소. p_restore_reward=true 면 reset_on_threshold_revert 행 INSERT 로 상점 복구.';
COMMENT ON FUNCTION public.issue_redemption(uuid, uuid, int, text, text) IS
  '상품권 발급. 잔액 100 미만이면 자동 rejected. 발급 시 points redeem 행 INSERT.';
COMMENT ON FUNCTION public.request_redemption(uuid) IS
  '학생 본인 상품권 신청. 가용 잔액(잔액 − 큐×100) ≥ 100 + 검토 진입 중 아닐 때만.';
COMMENT ON FUNCTION public.preview_penalty(uuid, int) IS
  '벌점 부여 dry-run: 분기 누적·임계치 도달·소멸 예상 잔액. 관리자 confirm 모달용.';
