-- 벌점 30점 상계를 "부분 상계"로 되돌린다 (+ 영구 미분류 방지 안전 조건)
--
-- 배경 (클라이언트 확정 2026-08-07)
--   2026-08-05 09:39 KST 배포(20260805180000)에서 상계식을 "전액 상계만"(A안)으로
--   바꿨으나 클라이언트가 반대했다. 원문:
--
--     "평생 1회이기 때문에, 벌점 30점 시점에 상계가 되면 된다고 생각합니다.
--      그 때의 상점이 1점이라도 일단 살아남는 게 우선이기 때문에,
--      벌점 30점 시점에 상점의 크기와 상관없이 상계시켜주시면 되겠습니다."
--
--   따라서 2026-05-26 ~ 8/5 의 부분 상계(LEAST)로 되돌린다.
--
-- ⚠️ 단순 LEAST 복원은 안 된다 — 안전 조건을 함께 넣는다.
--
--   벌점 부여 트리거는 30점을 "넘는 순간에만" 발화한다.
--   (20260601120000_penalty_auto_enabled_and_study_date.sql:145
--     IF v_total_after >= 30 AND v_total_before < 30 THEN ... )
--
--   LEAST 만 복원하면 이런 상태가 만들어진다:
--     net 28 → 5점 벌점 → net 33, 보유 상점 2점
--     → 상계 2 → net 31 → 30 미만이 아닌데 마크도 안 됨
--     → 이후 v_total_before 가 항상 30 이상이라 트리거가 두 번 다시 발화하지 않음
--     → 상계 자격은 태웠고, 벌점 60점이 되어도 영구히 분류되지 않음
--
--   그래서 "상계해도 net 이 30 미만으로 내려가지 못하면 상계하지 않고 그대로 분류한다".
--   자격(평생 1회)도 태우지 않는다.
--
-- 변경 대상은 아래 2개 함수뿐이다.
--   1) handle_penalty_threshold(uuid) — 상계식 + 분류 사유 문구
--   2) preview_penalty(uuid, int)     — 부여 전 미리보기 추정식
--
-- penalty_quarter_state_internal / points_offset_limit_scope /
-- maybe_revert_penalty_offset / dismiss_withdrawal_classification /
-- notify_withdrawal_classification / ensure_redemption_slots /
-- cleanup_redemption_slots / give_penalty_with_threshold_check 는 변경하지 않는다.


-- =============================================================
-- 1) 30점 도달 처리 — 부분 상계 복원 + 안전 조건
-- =============================================================
-- 상계액 규칙
--   v_offset := CASE WHEN v_consumed THEN 0 ELSE LEAST(가용, net) END
--   단, 상계해도 (net - offset) >= 30 이면 상계하지 않고 분류한다.
CREATE OR REPLACE FUNCTION public.handle_penalty_threshold(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_balance int;
  v_queue_count int;
  v_available int;
  v_state jsonb;
  v_penalty_net int;
  v_offset int;
  v_consumed boolean;
  v_review_at timestamptz;
  v_required_at timestamptz;
  v_dismissed_at timestamptz;
  v_dismissed_net int;
  v_cleanup jsonb;
  v_reason text;
BEGIN
  SELECT withdrawal_review_at, withdrawal_required_at,
         withdrawal_dismissed_at, withdrawal_dismissed_net
    INTO v_review_at, v_required_at, v_dismissed_at, v_dismissed_net
    FROM public.student_profiles
   WHERE id = p_student_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_a_student');
  END IF;

  -- 이미 분류된 학생은 재진입하지 않는다
  IF v_review_at IS NOT NULL OR v_required_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_classified');
  END IF;

  PERFORM 1 FROM public.points WHERE student_id = p_student_id FOR UPDATE;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.points
  WHERE student_id = p_student_id AND type = 'reward';

  SELECT COUNT(*) INTO v_queue_count
  FROM public.reward_redemptions
  WHERE student_id = p_student_id AND status IN ('requested', 'auto_pending');

  -- 클라이언트 확정: "발급 대기 중인 상점도 벌점 상계가 우선".
  -- 상계로 잔액이 100 아래로 떨어지면 아래에서 cleanup_redemption_slots 로 대기 건을 정리한다.
  v_available := GREATEST(0, v_balance);

  v_state := public.penalty_quarter_state_internal(p_student_id);
  v_penalty_net := (v_state->>'net')::int;
  v_consumed := (v_state->>'offset_consumed')::boolean;

  -- 관리자가 분류를 취소한 뒤 상황이 악화되지 않았으면 다시 올리지 않는다.
  IF v_dismissed_at IS NOT NULL
     AND v_dismissed_at >= public.get_current_quarter_start_kst()
     AND v_penalty_net <= COALESCE(v_dismissed_net, v_penalty_net)
  THEN
    RETURN jsonb_build_object(
      'status', 'dismissed_this_quarter',
      'dismissed_at', v_dismissed_at,
      'dismissed_net', v_dismissed_net
    );
  END IF;

  -- 부분 상계: 보유 상점만큼 덮는다 (상점 1점이라도 살리는 것이 우선)
  v_offset := CASE
    WHEN v_consumed THEN 0
    ELSE LEAST(v_available, v_penalty_net)
  END;

  -- ★ 안전 조건: 상계해도 net 이 30 미만으로 내려가지 못하면 상계하지 않는다.
  --   트리거가 30 교차 시점에만 발화하므로, 30 이상으로 남겨두면 이후 영원히
  --   재판정되지 않는다. 자격을 태우지 않고 그대로 분류한다.
  IF v_offset > 0 AND (v_penalty_net - v_offset) < 30 THEN
    INSERT INTO public.points (student_id, admin_id, type, amount, reason, is_auto, event_kind)
    VALUES (p_student_id, NULL, 'reward', -v_offset,
            '벌점 30점 도달로 상점 1:1 상계', true, 'offset_against_penalty');

    INSERT INTO public.points (student_id, admin_id, type, amount, reason, is_auto, event_kind)
    VALUES (p_student_id, NULL, 'penalty', -v_offset,
            '벌점 30점 도달로 상점 1:1 상계', true, 'offset_against_penalty');

    UPDATE public.student_profiles
    SET penalty_offset_in_quarter_total = penalty_offset_in_quarter_total + v_offset
    WHERE id = p_student_id;

    -- 상계로 잔액이 줄었으므로 자금이 부족해진 발급 대기 건을 정리한다.
    v_cleanup := public.cleanup_redemption_slots(p_student_id);

    RETURN jsonb_build_object(
      'status', 'offset',
      'offset_amount', v_offset,
      'reward_after', v_balance - v_offset,
      'penalty_after_net', v_penalty_net - v_offset,
      'will_require_withdrawal', false,
      'queue_count_before', v_queue_count,
      'cancelled_redemptions', COALESCE((v_cleanup->>'cancelled')::int, 0),
      'offset_already_consumed', false
    );
  ELSE
    -- 분류 사유 3갈래
    --   1) 상계 소진   2) 상계할 상점 0   3) 상계해도 30 이상 잔존(안전 조건)
    v_reason := CASE
      WHEN v_consumed THEN
        '벌점 30점 재도달 — 상계 소진 ('
      WHEN v_available = 0 THEN
        '벌점 30점 도달 시점 상계할 상점 없음 ('
      ELSE
        '벌점 30점 도달 — 상계해도 30점 미만이 되지 않아 상계 미적용 (보유 '
          || v_available || '점 / 벌점 ' || v_penalty_net || '점, '
    END || to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') || ')';

    -- 판정만 한다. withdrawal_notified_at 은 건드리지 않는다(= 미통보).
    UPDATE public.student_profiles
    SET withdrawal_required_at     = now(),
        withdrawal_required_reason = v_reason
    WHERE id = p_student_id;

    RETURN jsonb_build_object(
      'status', 'withdrawal_required',
      'offset_amount', 0,
      'reward_after', v_balance,
      'penalty_after_net', v_penalty_net,
      'available_reward', v_available,
      'will_require_withdrawal', true,
      'protected_queue_count', v_queue_count,
      'offset_already_consumed', v_consumed,
      'notified', false,
      'reason', v_reason
    );
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.handle_penalty_threshold(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_penalty_threshold(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.handle_penalty_threshold(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_penalty_threshold(uuid) TO service_role;


-- =============================================================
-- 2) 부여 전 미리보기 — 동일 규칙으로 추정
-- =============================================================
-- 반환 필드는 추가·삭제하지 않는다 (TS 타입이 그대로 물려 있다).
CREATE OR REPLACE FUNCTION public.preview_penalty(p_student_id uuid, p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_state jsonb;
  v_before int;
  v_after int;
  v_balance int;
  v_queue_count int;
  v_available int;
  v_offset_estimate int := 0;
  v_reaches int[] := ARRAY[]::int[];
  v_will_require boolean := false;
  v_review_at timestamptz;
  v_required_at timestamptz;
  v_notified_at timestamptz;
  v_already_marked boolean;
  v_consumed boolean;
BEGIN
  SELECT withdrawal_review_at, withdrawal_required_at, withdrawal_notified_at
    INTO v_review_at, v_required_at, v_notified_at
    FROM public.student_profiles WHERE id = p_student_id;
  v_already_marked := (v_review_at IS NOT NULL OR v_required_at IS NOT NULL);

  v_state := public.penalty_quarter_state_internal(p_student_id);
  v_before := (v_state->>'net')::int;
  v_consumed := (v_state->>'offset_consumed')::boolean;
  v_after := GREATEST(0, v_before + p_amount);

  IF v_after >= 10 AND v_before < 10 THEN v_reaches := array_append(v_reaches, 10); END IF;
  IF v_after >= 20 AND v_before < 20 THEN v_reaches := array_append(v_reaches, 20); END IF;
  IF v_after >= 25 AND v_before < 25 THEN v_reaches := array_append(v_reaches, 25); END IF;
  IF v_after >= 30 AND v_before < 30 THEN v_reaches := array_append(v_reaches, 30); END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.points WHERE student_id = p_student_id AND type = 'reward';

  SELECT COUNT(*) INTO v_queue_count
  FROM public.reward_redemptions
  WHERE student_id = p_student_id AND status IN ('requested', 'auto_pending');

  -- 대기 보호 없음 (상계 우선)
  v_available := GREATEST(0, v_balance);

  IF v_after >= 30 AND NOT v_already_marked THEN
    -- 부분 상계 + 안전 조건 (handle_penalty_threshold 와 동일 규칙)
    v_offset_estimate := CASE WHEN v_consumed THEN 0 ELSE LEAST(v_available, v_after) END;
    IF v_offset_estimate > 0 AND (v_after - v_offset_estimate) >= 30 THEN
      v_offset_estimate := 0;
    END IF;
    v_will_require := (v_offset_estimate = 0);
  END IF;

  RETURN jsonb_build_object(
    'quarter_total_before', v_before,
    'quarter_total_after', v_after,
    'thresholds_reached', to_jsonb(v_reaches),
    'reaches_30', v_after >= 30 AND NOT v_already_marked,
    'current_balance', v_balance,
    'queue_count', v_queue_count,
    'offset_estimate', v_offset_estimate,
    'reward_after_offset', v_balance - v_offset_estimate,
    'penalty_after_offset_net', v_after - v_offset_estimate,
    'will_require_withdrawal', v_will_require,
    'already_marked', v_already_marked,
    'pending_approval', v_required_at IS NOT NULL AND v_notified_at IS NULL,
    'offset_already_consumed', v_consumed,
    'protected_auto_pending', 0,
    'burnt_estimate', 0
  );
END $$;

REVOKE ALL ON FUNCTION public.preview_penalty(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_penalty(uuid, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_penalty(uuid, int) TO authenticated, service_role;


COMMENT ON FUNCTION public.handle_penalty_threshold(uuid) IS
  '벌점 30점 도달 처리. 보유 상점만큼 부분 상계한다(재원 중 1회). 상계해도 잔존 net 이 30 미만이 되지 않으면 상계하지 않고 강제 퇴원 대상으로 분류한다 — 트리거가 30 교차 시점에만 발화하므로 30 이상으로 남기면 영구히 재판정되지 않기 때문이다. 통보(withdrawal_notified_at)는 하지 않는다.';
