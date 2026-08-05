-- =============================================================
-- 강제 퇴원·상계를 관리자 승인제로 전환
-- =============================================================
-- 배경:
--   20260804120000 이 임계 판정을 교차식(after>=30 AND before<30)에서
--   상태 기반(net>=30 AND 마크없음)으로 바꾸면서, 그동안 우회 경로로 이미 30을
--   넘겨 판정을 받지 못했던 학생들이 "다음 벌점 부여 시 한꺼번에" 발화하게 됐다.
--   20260804160000 의 상계 1회 제한까지 겹치면서 prod 실측 기준 다음이 예정됐다.
--
--     - 2026-08-10(월) 09:00 주간 크론이 3개월 무등원 학생 1명을
--       시스템 판단으로 강제 퇴원 분류 + 푸시 5건 (관리자 조작 0회)
--     - 활성 25명에게 밀린 경고 29건 일괄 발송 (net 26 인 학생에게 "10점 도달")
--     - 상점 101점 보유 학생이 상품권 큐 보호로 가용 1점 → 1점 상계로
--       분기 기회 소진 → 다음 벌점에 강제 퇴원
--
--   기존 구조는 "시스템이 마크 → 학생에게 즉시 배너·푸시 → 관리자가 사후 해제"
--   순서였다. 관리자 화면에는 해제(cancel_withdrawal_review)만 있고 승인이 없다.
--   되돌릴 수 없는 처분인데 순서가 거꾸로다.
--
-- 이 마이그레이션:
--   1) 후보 컬럼 추가 — 시스템은 "후보"만 기록한다
--   2) handle_penalty_threshold → 후보 기록만. 상계·마크·학생 알림 전부 하지 않는다
--   3) approve_penalty_threshold — 관리자 승인 시에만 상계 또는 마크 실행
--   4) dismiss_penalty_threshold — 관리자가 후보를 해제 (면제·퇴원 처리 등)
--   5) maybe_revert_penalty_offset — 인가 검증 추가 + net<30 이면 후보 자동 해제
--   6) 밀린 경고 소급분 억제 (last_warned_at_* 시딩)
--   7) anon/PUBLIC EXECUTE 회수
--
-- 적용 순서: 20260804120000 → 20260804160000 → (이 파일). 반드시 연속 적용.


-- =============================================================
-- 1) 후보 컬럼
-- =============================================================
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS withdrawal_candidate_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawal_candidate_reason text,
  ADD COLUMN IF NOT EXISTS withdrawal_candidate_net int,
  ADD COLUMN IF NOT EXISTS withdrawal_candidate_available_reward int,
  ADD COLUMN IF NOT EXISTS withdrawal_candidate_offset_consumed boolean,
  ADD COLUMN IF NOT EXISTS withdrawal_dismissed_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawal_dismissed_reason text;

COMMENT ON COLUMN public.student_profiles.withdrawal_candidate_at IS
  '분기 벌점 30점 도달이 감지된 시각. 관리자 승인 대기 상태이며 학생에게는 노출하지 않는다. 승인(approve_penalty_threshold) 또는 해제(dismiss_penalty_threshold) 시 NULL 로 돌아간다.';
COMMENT ON COLUMN public.student_profiles.withdrawal_candidate_net IS
  '감지 당시 분기 벌점 잔존(net) 스냅샷. 표시용이며 승인 시에는 항상 재계산한다.';
COMMENT ON COLUMN public.student_profiles.withdrawal_candidate_available_reward IS
  '감지 당시 가용 상점(잔액 − 상품권 대기건수×100) 스냅샷. 표시용.';
COMMENT ON COLUMN public.student_profiles.withdrawal_dismissed_at IS
  '관리자가 30점 도달 처리를 하지 않기로 결정한 시각. 이번 분기 동안은 후보를 다시 만들지 않는다(경고 CAS 와 동일하게 분기시작과 비교하므로 크론 없이 자동 해제). 판정이 상태 기반이라 이 기록이 없으면 다음 벌점마다 후보가 재생성된다.';

CREATE INDEX IF NOT EXISTS idx_student_profiles_withdrawal_candidate
  ON public.student_profiles (withdrawal_candidate_at)
  WHERE withdrawal_candidate_at IS NOT NULL;


-- =============================================================
-- 2) 임계 도달 → 후보 기록만
-- =============================================================
-- 여기서는 상계도 마크도 하지 않는다. 반환 status='candidate' 를 받은 호출자는
-- 학생 알림을 발송하지 않는다 (src/lib/actions/notification.ts).
--
-- 재진입 차단: 이미 후보/검토/강제퇴원 상태면 아무것도 하지 않는다.
-- 상태 기반 판정이라 30점을 넘긴 뒤 벌점을 받을 때마다 호출되기 때문에,
-- 이 가드가 없으면 후보 시각이 계속 갱신되고 스냅샷이 덮어써진다.
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
  v_consumed boolean;
  v_candidate_at timestamptz;
  v_review_at timestamptz;
  v_required_at timestamptz;
  v_dismissed_at timestamptz;
  v_reason text;
BEGIN
  SELECT withdrawal_candidate_at, withdrawal_review_at, withdrawal_required_at, withdrawal_dismissed_at
    INTO v_candidate_at, v_review_at, v_required_at, v_dismissed_at
    FROM public.student_profiles
   WHERE id = p_student_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_a_student');
  END IF;

  IF v_candidate_at IS NOT NULL OR v_review_at IS NOT NULL OR v_required_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_pending', 'candidate_at', v_candidate_at);
  END IF;

  -- 관리자가 이번 분기에 "처리하지 않음"으로 결정했으면 다시 올리지 않는다.
  -- 판정이 상태 기반이라 이 가드가 없으면 벌점을 받을 때마다 후보가 재생성된다.
  -- 분기시작과 비교하므로 분기가 바뀌면 크론 없이 자동으로 풀린다.
  IF v_dismissed_at IS NOT NULL AND v_dismissed_at >= public.get_current_quarter_start_kst() THEN
    RETURN jsonb_build_object('status', 'dismissed_this_quarter', 'dismissed_at', v_dismissed_at);
  END IF;

  PERFORM 1 FROM public.points WHERE student_id = p_student_id FOR UPDATE;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.points
  WHERE student_id = p_student_id AND type = 'reward';

  SELECT COUNT(*) INTO v_queue_count
  FROM public.reward_redemptions
  WHERE student_id = p_student_id AND status IN ('requested', 'auto_pending');

  v_available := GREATEST(0, v_balance - v_queue_count * 100);

  v_state := public.penalty_quarter_state_internal(p_student_id);
  v_penalty_net := (v_state->>'net')::int;
  v_consumed := (v_state->>'offset_consumed')::boolean;

  v_reason := '분기 벌점 ' || v_penalty_net || '점 도달 (' ||
              to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') || ')' ||
              CASE WHEN v_consumed THEN ' — 이번 분기 상계 소진' ELSE '' END;

  UPDATE public.student_profiles
  SET withdrawal_candidate_at              = now(),
      withdrawal_candidate_reason          = v_reason,
      withdrawal_candidate_net             = v_penalty_net,
      withdrawal_candidate_available_reward = v_available,
      withdrawal_candidate_offset_consumed = v_consumed
  WHERE id = p_student_id;

  RETURN jsonb_build_object(
    'status', 'candidate',
    'penalty_net', v_penalty_net,
    'available_reward', v_available,
    'protected_queue_count', v_queue_count,
    'offset_already_consumed', v_consumed,
    -- 승인 시 예상되는 결과 (관리자 화면 표시용, 승인 시점에 재계산됨)
    'expected_offset', CASE WHEN v_consumed THEN 0 ELSE LEAST(v_available, v_penalty_net) END,
    'reason', v_reason
  );
END $$;

-- 내부 전용 — give_penalty_with_threshold_check(SECURITY DEFINER) 안에서만 호출된다.
-- 정의자 권한으로 실행되므로 호출자에게 EXECUTE 를 줄 필요가 없다.
REVOKE ALL ON FUNCTION public.handle_penalty_threshold(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.handle_penalty_threshold(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.handle_penalty_threshold(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.handle_penalty_threshold(uuid) TO service_role;


-- =============================================================
-- 3) 관리자 승인 — 실제 상계 또는 강제 퇴원 마크
-- =============================================================
-- 후보 상태의 학생에 대해 관리자가 승인하면 그때 실행된다.
-- 반환 형태는 기존 handle_penalty_threshold 와 동일하게 유지해
-- notifyPenaltyThreshold(TS) 가 그대로 재사용할 수 있게 한다.
CREATE OR REPLACE FUNCTION public.approve_penalty_threshold(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid;
  v_allowed boolean := false;
  v_balance int;
  v_queue_count int;
  v_available int;
  v_state jsonb;
  v_penalty_net int;
  v_offset int;
  v_consumed boolean;
  v_candidate_at timestamptz;
  v_reason text;
BEGIN
  -- 인가: service_role 또는 (동일 지점 관리자 / 최고 관리자)
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    v_allowed := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = v_caller
      AND me.user_type = 'admin'
      AND (
        me.is_super_admin
        OR EXISTS (
          SELECT 1 FROM public.profiles s
          WHERE s.id = p_student_id AND s.branch_id = me.branch_id
        )
      )
  ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'permission denied: approve_penalty_threshold'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 락 순서 규약: student_profiles → points
  SELECT withdrawal_candidate_at INTO v_candidate_at
    FROM public.student_profiles
   WHERE id = p_student_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_a_student');
  END IF;

  IF v_candidate_at IS NULL THEN
    RETURN jsonb_build_object('status', 'not_a_candidate');
  END IF;

  PERFORM 1 FROM public.points WHERE student_id = p_student_id FOR UPDATE;

  -- 승인 시점 기준으로 항상 재계산한다 (후보 등록 이후 상점·벌점이 변했을 수 있다)
  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.points
  WHERE student_id = p_student_id AND type = 'reward';

  SELECT COUNT(*) INTO v_queue_count
  FROM public.reward_redemptions
  WHERE student_id = p_student_id AND status IN ('requested', 'auto_pending');

  v_available := GREATEST(0, v_balance - v_queue_count * 100);

  v_state := public.penalty_quarter_state_internal(p_student_id);
  v_penalty_net := (v_state->>'net')::int;
  v_consumed := (v_state->>'offset_consumed')::boolean;

  -- 승인 시점에 이미 30 미만으로 내려갔으면 (벌점 취소 등) 아무것도 하지 않는다
  IF v_penalty_net < 30 THEN
    UPDATE public.student_profiles
    SET withdrawal_candidate_at = NULL,
        withdrawal_candidate_reason = NULL,
        withdrawal_candidate_net = NULL,
        withdrawal_candidate_available_reward = NULL,
        withdrawal_candidate_offset_consumed = NULL
    WHERE id = p_student_id;

    RETURN jsonb_build_object('status', 'no_longer_required', 'penalty_after_net', v_penalty_net);
  END IF;

  v_offset := CASE WHEN v_consumed THEN 0 ELSE LEAST(v_available, v_penalty_net) END;

  IF v_offset > 0 THEN
    INSERT INTO public.points (student_id, admin_id, type, amount, reason, is_auto, event_kind)
    VALUES (p_student_id, NULL, 'reward', -v_offset,
            '벌점 30점 도달로 상점 1:1 상계', true, 'offset_against_penalty');

    INSERT INTO public.points (student_id, admin_id, type, amount, reason, is_auto, event_kind)
    VALUES (p_student_id, NULL, 'penalty', -v_offset,
            '벌점 30점 도달로 상점 1:1 상계', true, 'offset_against_penalty');

    UPDATE public.student_profiles
    SET penalty_offset_in_quarter_total = penalty_offset_in_quarter_total + v_offset,
        withdrawal_candidate_at = NULL,
        withdrawal_candidate_reason = NULL,
        withdrawal_candidate_net = NULL,
        withdrawal_candidate_available_reward = NULL,
        withdrawal_candidate_offset_consumed = NULL
    WHERE id = p_student_id;

    RETURN jsonb_build_object(
      'status', 'offset',
      'offset_amount', v_offset,
      'reward_after', v_balance - v_offset,
      'penalty_after_net', v_penalty_net - v_offset,
      'will_require_withdrawal', false,
      'protected_queue_count', v_queue_count,
      'offset_already_consumed', false
    );
  ELSE
    v_reason := CASE
      WHEN v_consumed THEN
        '벌점 30점 재도달 — 상계 소진 (' ||
        to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') || ')'
      ELSE
        '벌점 30점 도달 시점 가용 상점 0 (' ||
        to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD') || ')'
    END;

    UPDATE public.student_profiles
    SET withdrawal_required_at     = COALESCE(withdrawal_required_at, now()),
        withdrawal_required_reason = COALESCE(withdrawal_required_reason, v_reason),
        withdrawal_candidate_at = NULL,
        withdrawal_candidate_reason = NULL,
        withdrawal_candidate_net = NULL,
        withdrawal_candidate_available_reward = NULL,
        withdrawal_candidate_offset_consumed = NULL
    WHERE id = p_student_id;

    RETURN jsonb_build_object(
      'status', 'withdrawal_required',
      'offset_amount', 0,
      'reward_after', v_balance,
      'penalty_after_net', v_penalty_net,
      'will_require_withdrawal', true,
      'protected_queue_count', v_queue_count,
      'offset_already_consumed', v_consumed
    );
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.approve_penalty_threshold(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_penalty_threshold(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.approve_penalty_threshold(uuid) TO authenticated, service_role;


-- =============================================================
-- 4) 관리자 해제 — 후보를 실행하지 않고 종료
-- =============================================================
-- 예: 장기 미등원으로 이미 이탈한 학생, 관리자 오부여로 생긴 후보, 면제 대상.
-- 후보만 지우고 벌점·상점은 건드리지 않는다.
CREATE OR REPLACE FUNCTION public.dismiss_penalty_threshold(
  p_student_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid;
  v_allowed boolean := false;
  v_candidate_at timestamptz;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    v_allowed := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = v_caller
      AND me.user_type = 'admin'
      AND (
        me.is_super_admin
        OR EXISTS (
          SELECT 1 FROM public.profiles s
          WHERE s.id = p_student_id AND s.branch_id = me.branch_id
        )
      )
  ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'permission denied: dismiss_penalty_threshold'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT withdrawal_candidate_at INTO v_candidate_at
    FROM public.student_profiles
   WHERE id = p_student_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_a_student');
  END IF;

  IF v_candidate_at IS NULL THEN
    RETURN jsonb_build_object('status', 'not_a_candidate');
  END IF;

  UPDATE public.student_profiles
  SET withdrawal_candidate_at = NULL,
      withdrawal_candidate_reason = NULL,
      withdrawal_candidate_net = NULL,
      withdrawal_candidate_available_reward = NULL,
      withdrawal_candidate_offset_consumed = NULL,
      -- 결정을 기록한다. 이번 분기 동안 재등장하지 않는다.
      withdrawal_dismissed_at = now(),
      withdrawal_dismissed_reason = p_reason
  WHERE id = p_student_id;

  RETURN jsonb_build_object('status', 'dismissed', 'dismissed_reason', p_reason);
END $$;

REVOKE ALL ON FUNCTION public.dismiss_penalty_threshold(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dismiss_penalty_threshold(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.dismiss_penalty_threshold(uuid, text) TO authenticated, service_role;


-- =============================================================
-- 4-2) 제외 되돌리기
-- =============================================================
-- 제외를 분기 동안 유지하면 되돌릴 방법이 없어진다(제외된 학생은 큐에서 사라지고
-- 다음 벌점에도 후보가 생기지 않는다). 관리자가 판단을 번복할 수 있어야 한다.
-- 되돌린 즉시 조건(net>=30)을 다시 평가해 후보를 복원한다.
CREATE OR REPLACE FUNCTION public.undismiss_penalty_threshold(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid;
  v_allowed boolean := false;
  v_dismissed_at timestamptz;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    v_allowed := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = v_caller
      AND me.user_type = 'admin'
      AND (
        me.is_super_admin
        OR EXISTS (
          SELECT 1 FROM public.profiles s
          WHERE s.id = p_student_id AND s.branch_id = me.branch_id
        )
      )
  ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'permission denied: undismiss_penalty_threshold'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT withdrawal_dismissed_at INTO v_dismissed_at
    FROM public.student_profiles WHERE id = p_student_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_a_student');
  END IF;
  IF v_dismissed_at IS NULL THEN
    RETURN jsonb_build_object('status', 'not_dismissed');
  END IF;

  UPDATE public.student_profiles
  SET withdrawal_dismissed_at = NULL,
      withdrawal_dismissed_reason = NULL
  WHERE id = p_student_id;

  -- 아직 30점 이상이면 후보를 즉시 복원한다 (아래로 내려갔으면 아무것도 하지 않는다)
  IF (public.penalty_quarter_state_internal(p_student_id)->>'net')::int >= 30 THEN
    RETURN jsonb_build_object(
      'status', 'undismissed',
      'threshold', public.handle_penalty_threshold(p_student_id)
    );
  END IF;

  RETURN jsonb_build_object('status', 'undismissed', 'threshold', NULL);
END $$;

REVOKE ALL ON FUNCTION public.undismiss_penalty_threshold(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undismiss_penalty_threshold(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.undismiss_penalty_threshold(uuid) TO authenticated, service_role;


-- =============================================================
-- 5) 상계 되돌리기 — 인가 검증 + 후보 자동 해제
-- =============================================================
-- 20260804160000 의 정의에는 호출자 인가 검증이 없었다. SECURITY DEFINER +
-- authenticated EXECUTE 조합이라, 학생이 임의 student_id 로 호출해 상계를
-- 되돌리고(상점 복구) 1회 제한까지 풀 수 있었다.
CREATE OR REPLACE FUNCTION public.maybe_revert_penalty_offset(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid;
  v_allowed boolean := false;
  v_state jsonb;
  v_net int;
  v_offset int;
BEGIN
  -- 인가: service_role 또는 (동일 지점 관리자 / 최고 관리자).
  -- 호출자는 cancel_point 경유 관리자 액션뿐이다 (src/lib/points.ts).
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    v_allowed := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.profiles me
    WHERE me.id = v_caller
      AND me.user_type = 'admin'
      AND (
        me.is_super_admin
        OR EXISTS (
          SELECT 1 FROM public.profiles s
          WHERE s.id = p_student_id AND s.branch_id = me.branch_id
        )
      )
  ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'permission denied: maybe_revert_penalty_offset'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1 FROM public.student_profiles WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_a_student');
  END IF;

  v_state := public.penalty_quarter_state_internal(p_student_id);
  v_net := (v_state->>'net')::int;
  v_offset := (v_state->>'offset')::int;

  -- 벌점이 30 미만으로 내려갔으면 승인 대기 후보를 자동 해제한다.
  -- (관리자가 오부여 벌점을 취소하면 후보도 함께 사라져야 한다)
  IF v_net < 30 THEN
    UPDATE public.student_profiles
    SET withdrawal_candidate_at = NULL,
        withdrawal_candidate_reason = NULL,
        withdrawal_candidate_net = NULL,
        withdrawal_candidate_available_reward = NULL,
        withdrawal_candidate_offset_consumed = NULL
    WHERE id = p_student_id
      AND withdrawal_candidate_at IS NOT NULL;
  END IF;

  IF v_offset <= 0 THEN
    RETURN jsonb_build_object('status', 'no_offset');
  END IF;

  IF (v_net + v_offset) >= 30 THEN
    RETURN jsonb_build_object('status', 'still_required', 'net_if_reverted', v_net + v_offset);
  END IF;

  INSERT INTO public.points (student_id, admin_id, type, amount, reason, is_auto, event_kind)
  VALUES (p_student_id, NULL, 'reward', v_offset,
          '벌점 취소로 상계 되돌림', true, 'offset_against_penalty_revert');

  INSERT INTO public.points (student_id, admin_id, type, amount, reason, is_auto, event_kind)
  VALUES (p_student_id, NULL, 'penalty', v_offset,
          '벌점 취소로 상계 되돌림', true, 'offset_against_penalty_revert');

  UPDATE public.student_profiles
  SET penalty_offset_in_quarter_total = GREATEST(0, penalty_offset_in_quarter_total - v_offset)
  WHERE id = p_student_id;

  RETURN jsonb_build_object(
    'status', 'reverted',
    'restored_reward', v_offset,
    'restored_penalty', v_offset,
    'net_after', v_net + v_offset
  );
END $$;

REVOKE ALL ON FUNCTION public.maybe_revert_penalty_offset(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.maybe_revert_penalty_offset(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.maybe_revert_penalty_offset(uuid) TO authenticated, service_role;


-- =============================================================
-- 6) 보호 컬럼 트리거 — 후보 컬럼 추가
-- =============================================================
CREATE OR REPLACE FUNCTION public.enforce_student_profile_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (SELECT public.get_user_type()) = 'admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.withdrawal_review_at            IS DISTINCT FROM OLD.withdrawal_review_at
     OR NEW.withdrawal_review_reason     IS DISTINCT FROM OLD.withdrawal_review_reason
     OR NEW.withdrawal_required_at       IS DISTINCT FROM OLD.withdrawal_required_at
     OR NEW.withdrawal_required_reason   IS DISTINCT FROM OLD.withdrawal_required_reason
     OR NEW.withdrawal_candidate_at      IS DISTINCT FROM OLD.withdrawal_candidate_at
     OR NEW.withdrawal_candidate_reason  IS DISTINCT FROM OLD.withdrawal_candidate_reason
     OR NEW.withdrawal_candidate_net     IS DISTINCT FROM OLD.withdrawal_candidate_net
     OR NEW.withdrawal_candidate_available_reward
                                         IS DISTINCT FROM OLD.withdrawal_candidate_available_reward
     OR NEW.withdrawal_candidate_offset_consumed
                                         IS DISTINCT FROM OLD.withdrawal_candidate_offset_consumed
     OR NEW.withdrawal_dismissed_at      IS DISTINCT FROM OLD.withdrawal_dismissed_at
     OR NEW.withdrawal_dismissed_reason  IS DISTINCT FROM OLD.withdrawal_dismissed_reason
     OR NEW.threshold_consumed_in_quarter_at IS DISTINCT FROM OLD.threshold_consumed_in_quarter_at
     OR NEW.penalty_offset_in_quarter_total  IS DISTINCT FROM OLD.penalty_offset_in_quarter_total
     OR NEW.last_warned_at_10            IS DISTINCT FROM OLD.last_warned_at_10
     OR NEW.last_warned_at_20            IS DISTINCT FROM OLD.last_warned_at_20
     OR NEW.last_warned_at_25            IS DISTINCT FROM OLD.last_warned_at_25
  THEN
    RAISE EXCEPTION '상벌점 임계 상태 컬럼은 관리자만 변경할 수 있습니다. (student_id=%)', NEW.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END $$;


-- =============================================================
-- 6-2) 부여 전 미리보기 — 승인 대기 상태 반영
-- =============================================================
-- already_marked 에 후보 상태를 포함시킨다. 이미 승인 대기 중인 학생에게 벌점을
-- 더 줘도 handle_penalty_threshold 는 already_pending 으로 아무것도 하지 않으므로,
-- 관리자 확인 문구가 "승인 대기에 등록됩니다"라고 다시 뜨면 사실과 다르다.
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
  v_candidate_at timestamptz;
  v_already_marked boolean;
  v_consumed boolean;
BEGIN
  SELECT withdrawal_review_at, withdrawal_required_at, withdrawal_candidate_at
    INTO v_review_at, v_required_at, v_candidate_at
    FROM public.student_profiles WHERE id = p_student_id;
  v_already_marked := (v_review_at IS NOT NULL OR v_required_at IS NOT NULL OR v_candidate_at IS NOT NULL);

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

  v_available := GREATEST(0, v_balance - v_queue_count * 100);

  IF v_after >= 30 AND NOT v_already_marked THEN
    v_offset_estimate := CASE WHEN v_consumed THEN 0 ELSE LEAST(v_available, v_after) END;
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
    'pending_approval', v_candidate_at IS NOT NULL,
    'offset_already_consumed', v_consumed,
    'protected_auto_pending', 0,
    'burnt_estimate', 0
  );
END $$;

REVOKE ALL ON FUNCTION public.preview_penalty(uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_penalty(uuid, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.preview_penalty(uuid, int) TO authenticated, service_role;


-- =============================================================
-- 7) 밀린 경고 소급분 억제
-- =============================================================
-- 경고(10/20/25)는 20260804120000 에서 before<N 조건이 제거되고 dedupe 를
-- CAS(last_warned_at_N < 분기시작)에만 의존하게 됐다. 그 결과 "이미 넘겼지만
-- 통보받지 못한" 학생들의 경고가 다음 벌점 부여 시 한꺼번에 발화한다.
-- prod 실측: 활성 25명 / 29건 (1인 최대 3건), net 26 인 학생에게 "10점 도달".
--
-- 지난 일을 뒤늦게 통보하지 않는다. 현재 시각으로 시딩해 소급분만 억제하고,
-- 앞으로 새로 기준을 넘는 학생은 정상적으로 경고를 받는다.
DO $$
DECLARE
  v_quarter_start timestamptz := public.get_current_quarter_start_kst();
  v_seeded int;
BEGIN
  WITH active_net AS (
    SELECT sp.id,
           (public.penalty_quarter_state_internal(sp.id)->>'net')::int AS net
    FROM public.student_profiles sp
    JOIN public.profiles p ON p.id = sp.id
    WHERE p.withdrawn_at IS NULL
  ), seeded AS (
    UPDATE public.student_profiles sp
    SET last_warned_at_10 = CASE
          WHEN an.net >= 10 AND (sp.last_warned_at_10 IS NULL OR sp.last_warned_at_10 < v_quarter_start)
          THEN now() ELSE sp.last_warned_at_10 END,
        last_warned_at_20 = CASE
          WHEN an.net >= 20 AND (sp.last_warned_at_20 IS NULL OR sp.last_warned_at_20 < v_quarter_start)
          THEN now() ELSE sp.last_warned_at_20 END,
        last_warned_at_25 = CASE
          WHEN an.net >= 25 AND (sp.last_warned_at_25 IS NULL OR sp.last_warned_at_25 < v_quarter_start)
          THEN now() ELSE sp.last_warned_at_25 END
    FROM active_net an
    WHERE sp.id = an.id
      AND (
        (an.net >= 10 AND (sp.last_warned_at_10 IS NULL OR sp.last_warned_at_10 < v_quarter_start))
        OR (an.net >= 20 AND (sp.last_warned_at_20 IS NULL OR sp.last_warned_at_20 < v_quarter_start))
        OR (an.net >= 25 AND (sp.last_warned_at_25 IS NULL OR sp.last_warned_at_25 < v_quarter_start))
      )
    RETURNING sp.id
  )
  SELECT count(*) INTO v_seeded FROM seeded;

  RAISE NOTICE '경고 소급분 억제: 학생 %명', v_seeded;
END $$;


-- =============================================================
-- 8) anon / PUBLIC EXECUTE 회수
-- =============================================================
-- prod ACL 실측 결과 두 함수 모두 PUBLIC(=X) + anon=X 로 열려 있었다.
-- anon 키만으로 임의 학생에게 벌점을 부여하거나 상계를 유발할 수 있는 상태다.
REVOKE ALL ON FUNCTION public.give_penalty_with_threshold_check(uuid, uuid, int, text, uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.give_penalty_with_threshold_check(uuid, uuid, int, text, uuid, text, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.give_penalty_with_threshold_check(uuid, uuid, int, text, uuid, text, date)
  TO authenticated, service_role;
