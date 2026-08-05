-- 강제 퇴원: 판정은 자동, 학생 통보만 관리자 확인 후
--
-- 배경 (클라이언트 협의 2026-08-05)
--   "시스템상으로는 강제퇴원 될 수 있게끔 해주시되 저희가 메뉴얼하게 삭제 가능하게"
--
--   직전 배포(20260805120000)는 승인제였다 — 30점 도달 시 후보만 기록하고 상계·마크·
--   알림을 전부 보류했다. 클라이언트 요구는 그 반대다.
--
--   다만 "자동 마크"는 곧 학생 앱 빨간 배너 + 푸시 알림이다. 오판이 학생·학부모에게
--   먼저 도달하면 관리자가 지워도 이미 본 뒤다. 그래서 판정과 통보를 분리한다.
--
--     판정(withdrawal_required_at)  — 시스템 자동
--     통보(withdrawal_notified_at)  — 관리자 조작 시에만
--
--   학생·학부모 화면은 notified_at 을 기준으로 배너를 띄운다(TS 계층에서 게이트).
--
-- 시한: 2026-08-10(월) 09:00 KST 주간 크론에서 이리디아 학생이 자동 마크된다.
--       그 전에 배포되지 않으면 구 코드가 통보 전에 배너를 노출한다.
--
-- 클라이언트 요구 3가지를 함께 반영한다
--   1) 상계 제한: 분기 1회 → 재원 기간 중 평생 1회
--   2) 발급 대기 중인 상점도 상계에 우선 반영 (대기 100점 보호 해제)
--   3) 강제 퇴원 자동 판정 + 관리자 수동 삭제 (통보만 게이트)
--
-- 이 마이그레이션이 하는 일
--   1) withdrawal_notified_at / withdrawal_dismissed_net 컬럼 추가
--   2) points_offset_limit_scope → 'lifetime'
--   3) penalty_quarter_state_internal — clamp 되지 않은 net_raw 노출
--   4) handle_penalty_threshold — 자동 실행 복원 + 전액 상계 원칙(A안)
--                                 + 대기 보호 해제 + 상계 후 큐 정리
--   5) maybe_revert_penalty_offset — still_required 판정을 net_raw 로 (clamp 오탐 수정)
--   6) preview_penalty — 위 규칙 반영
--   7) withdrawal_notified_at 을 지우는 경로 정리 (cancel_withdrawal_review 포함)
--   8) 승인제 함수 → 통보제 함수로 교체
--   9) ensure_redemption_slots 스킵 조건을 "통보 기준" 으로
--
-- 범위 밖(9/1 전까지): 지난 분기 상계 되돌리기(points.reverts_point_id 도입),
--                      withdrawal_candidate_* 컬럼 DROP
--   평생 1회에서 지난 분기 상계는 되돌릴 수 없다 — 되돌릴 금액 조회가 분기 한정이기
--   때문이다. 현 분기 상계는 정상 동작하고, 지난 분기 상계는 현재 퇴원자 1건뿐이라
--   실제 문제는 2026-09-01 이후에 발생한다.


-- =============================================================
-- 1) 컬럼
-- =============================================================
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS withdrawal_notified_at timestamptz,
  ADD COLUMN IF NOT EXISTS withdrawal_dismissed_net int;

COMMENT ON COLUMN public.student_profiles.withdrawal_notified_at IS
  '강제 퇴원 분류를 학생에게 통보한 시각. NULL 이면 판정만 된 상태이며 학생·학부모 화면에 노출하지 않는다. withdrawal_required_at 을 NULL 로 만드는 모든 경로에서 이 값도 함께 지워야 한다 — 남아 있으면 재판정 시 관리자 조작 없이 배너가 부활한다.';
COMMENT ON COLUMN public.student_profiles.withdrawal_dismissed_net IS
  '관리자가 분류를 취소한 시점의 분기 벌점 잔존값. 이 값을 넘어서면 다시 판정한다(분기 전체를 봉인하지 않기 위함).';

-- withdrawal_candidate_* 5개 컬럼은 이번에 DROP 하지 않는다.
-- 참조 함수가 6개이고 enforce_student_profile_protected_columns 를 빠뜨리면
-- 모든 비관리자 student_profiles UPDATE 가 실패한다. 데이터 0건이라 놔둬도
-- 무해하므로 2차로 미뤄 이번 배포의 폭발 반경을 줄인다.


-- =============================================================
-- 1-2) 상계 1회 제한 — 분기 → 평생
-- =============================================================
-- 클라이언트 확정: "재원 기간 중 단 한 번만".
CREATE OR REPLACE FUNCTION public.points_offset_limit_scope()
RETURNS text
LANGUAGE sql
STABLE
AS $$ SELECT 'lifetime'::text $$;

COMMENT ON FUNCTION public.points_offset_limit_scope() IS
  '상계 1회 제한 범위. lifetime = 재원 기간 중 1회(현행), quarter = 분기당 1회. IMMUTABLE 이 아니라 STABLE 로 둔다 — 정책값이므로 상수 폴딩 대상이 되어선 안 된다.';


-- =============================================================
-- 1-3) 분기 벌점 상태 — clamp 되지 않은 원합 노출
-- =============================================================
-- net 은 GREATEST(0, 합) 으로 clamp 된다(이전 분기 벌점을 이번 분기에 취소하면
-- 합이 음수로 끌리기 때문). 그런데 되돌리기 판정에 clamp 된 값을 쓰면 오탐이 난다.
--
--   전액 상계 후 벌점행 합 = 0 → 벌점 5점 취소 → 합 −5 → clamp 0
--   → still_required 판정식 `0 + 상계액 >= 30` 이 참 → 되돌리기 거부
--   실제로는 원합 25 라 되돌려야 한다. 평생 1회에서는 이 오탐이 자격 영구 박탈이 된다.
CREATE OR REPLACE FUNCTION public.penalty_quarter_state_internal(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quarter_start timestamptz;
  v_scope text;
  v_net int;
  v_offset int;
  v_offset_events int;
  v_revert_events int;
BEGIN
  v_quarter_start := public.get_current_quarter_start_kst();
  v_scope := public.points_offset_limit_scope();

  SELECT COALESCE(SUM(amount), 0) INTO v_net
  FROM public.points
  WHERE student_id = p_student_id
    AND type = 'penalty'
    AND created_at >= v_quarter_start;

  SELECT COALESCE(-SUM(amount), 0) INTO v_offset
  FROM public.points
  WHERE student_id = p_student_id
    AND type = 'penalty'
    AND event_kind IN ('offset_against_penalty', 'offset_against_penalty_revert')
    AND created_at >= v_quarter_start;

  SELECT
    count(*) FILTER (WHERE event_kind = 'offset_against_penalty'),
    count(*) FILTER (WHERE event_kind = 'offset_against_penalty_revert')
  INTO v_offset_events, v_revert_events
  FROM public.points
  WHERE student_id = p_student_id
    AND type = 'penalty'
    AND event_kind IN ('offset_against_penalty', 'offset_against_penalty_revert')
    AND (v_scope = 'lifetime' OR created_at >= v_quarter_start);

  RETURN jsonb_build_object(
    'quarter_start', v_quarter_start,
    'net', GREATEST(0, v_net),
    'net_raw', v_net,            -- clamp 전 원합. 되돌리기 판정 전용.
    'offset', v_offset,
    'raw', GREATEST(0, v_net) + v_offset,
    'offset_consumed', COALESCE(v_offset_events, 0) > COALESCE(v_revert_events, 0),
    'limit_scope', v_scope
  );
END $$;

REVOKE ALL ON FUNCTION public.penalty_quarter_state_internal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.penalty_quarter_state_internal(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.penalty_quarter_state_internal(uuid) FROM authenticated;


-- =============================================================
-- 2) 30점 도달 처리 — 자동 실행 복원 + 전액 상계 원칙
-- =============================================================
-- 상계액 규칙 변경 (A안)
--   변경 전: v_offset = LEAST(가용, net)  → 상점 3점이면 3점만 상계되고 자격 소진
--   변경 후: 가용 >= net 일 때만 전액 상계. 부족하면 상계하지 않고 마크.
--
--   이유: 상점 1~29점 보유 활성 학생이 162명(61%)이다. 3점짜리 상계로 상계 자격을
--         태우는 것은 "상계 1회"의 상식적 의미(한 번의 완전한 구제)와 어긋난다.
--         부분 상계를 아예 하지 않으므로 "3점씩 반복 상계" 루프도 생기지 않는다.
--         되돌릴 수 있는 선택이다 — 반대 결정이 오면 조건 한 줄이고,
--         그동안 자격을 잃은 학생은 없다.
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
  -- 기존에는 대기 1건당 100점을 보호해 상계에서 제외했으나, 이제 잔액 전액을 가용으로 본다.
  -- 상계로 잔액이 100 아래로 떨어지면 아래에서 cleanup_redemption_slots 로 대기 건을 정리한다.
  v_available := GREATEST(0, v_balance);

  v_state := public.penalty_quarter_state_internal(p_student_id);
  v_penalty_net := (v_state->>'net')::int;
  v_consumed := (v_state->>'offset_consumed')::boolean;

  -- 관리자가 분류를 취소한 뒤 상황이 악화되지 않았으면 다시 올리지 않는다.
  -- 분기 전체를 봉인하지 않기 위해 취소 시점 net 을 넘어설 때만 재판정한다.
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

  -- 전액 상계가 가능할 때만 상계한다 (A안)
  v_offset := CASE
    WHEN v_consumed THEN 0
    WHEN v_available >= v_penalty_net THEN v_penalty_net
    ELSE 0
  END;

  IF v_offset > 0 THEN
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
    -- 호출하지 않으면 잔액 71점인데 100점짜리 대기 건이 남아 유령이 된다.
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
    v_reason := CASE
      WHEN v_consumed THEN
        '벌점 30점 재도달 — 상계 소진 ('
      ELSE
        '벌점 30점 도달 시점 상계 가능 상점 부족 (보유 ' || v_available || '점 / 필요 ' || v_penalty_net || '점, '
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
-- 3) 통보 — 관리자 조작 시에만
-- =============================================================
CREATE OR REPLACE FUNCTION public.notify_withdrawal_classification(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid;
  v_allowed boolean := false;
  v_required_at timestamptz;
  v_notified_at timestamptz;
  v_reason text;
  v_balance int;
  v_state jsonb;
BEGIN
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
    RAISE EXCEPTION 'permission denied: notify_withdrawal_classification'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT withdrawal_required_at, withdrawal_notified_at, withdrawal_required_reason
    INTO v_required_at, v_notified_at, v_reason
    FROM public.student_profiles WHERE id = p_student_id FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_a_student'); END IF;
  IF v_required_at IS NULL THEN RETURN jsonb_build_object('status', 'not_classified'); END IF;
  IF v_notified_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_notified', 'notified_at', v_notified_at);
  END IF;

  UPDATE public.student_profiles
  SET withdrawal_notified_at = now()
  WHERE id = p_student_id;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.points WHERE student_id = p_student_id AND type = 'reward';

  v_state := public.penalty_quarter_state_internal(p_student_id);

  RETURN jsonb_build_object(
    'status', 'notified',
    'classified_at', v_required_at,
    'reason', v_reason,
    'reward_balance', v_balance,
    'penalty_net', (v_state->>'net')::int,
    'offset_already_consumed', (v_state->>'offset_consumed')::boolean
  );
END $$;

REVOKE ALL ON FUNCTION public.notify_withdrawal_classification(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.notify_withdrawal_classification(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.notify_withdrawal_classification(uuid) TO authenticated, service_role;


-- =============================================================
-- 4) 분류 취소 — 마크·통보 해제 + 재판정 기준 기록
-- =============================================================
-- 기존 dismiss_penalty_threshold(승인 대기 후보 제외)를 대체한다.
-- 관리자 UI 의 '분류 취소'(cancelRequiredWithdrawal)도 이 함수로 통합한다 —
-- 재판정 방지 기록이 붙는 쪽이 정답이기 때문이다.
CREATE OR REPLACE FUNCTION public.dismiss_withdrawal_classification(
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
  v_required_at timestamptz;
  v_notified_at timestamptz;
  v_net int;
  v_ensure jsonb;
BEGIN
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
    RAISE EXCEPTION 'permission denied: dismiss_withdrawal_classification'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT withdrawal_required_at, withdrawal_notified_at
    INTO v_required_at, v_notified_at
    FROM public.student_profiles WHERE id = p_student_id FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_a_student'); END IF;
  IF v_required_at IS NULL THEN RETURN jsonb_build_object('status', 'not_classified'); END IF;

  v_net := (public.penalty_quarter_state_internal(p_student_id)->>'net')::int;

  UPDATE public.student_profiles
  SET withdrawal_required_at     = NULL,
      withdrawal_required_reason = NULL,
      withdrawal_notified_at     = NULL,
      withdrawal_dismissed_at    = now(),
      withdrawal_dismissed_reason = p_reason,
      withdrawal_dismissed_net   = v_net
  WHERE id = p_student_id;

  -- 분류 때문에 멈춰 있던 상품권 자동 발급을 복구한다.
  -- (기존 cancel_withdrawal_review 가 하던 일이므로 빠뜨리면 영구 누락된다)
  v_ensure := public.ensure_redemption_slots(p_student_id);

  RETURN jsonb_build_object(
    'status', 'dismissed',
    'was_notified', v_notified_at IS NOT NULL,
    'dismissed_net', v_net,
    'ensure_result', v_ensure
  );
END $$;

REVOKE ALL ON FUNCTION public.dismiss_withdrawal_classification(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dismiss_withdrawal_classification(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.dismiss_withdrawal_classification(uuid, text)
  TO authenticated, service_role;


-- =============================================================
-- 5) 분류 취소 되돌리기
-- =============================================================
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
    WHERE me.id = v_caller AND me.user_type = 'admin'
      AND (me.is_super_admin OR EXISTS (
        SELECT 1 FROM public.profiles s WHERE s.id = p_student_id AND s.branch_id = me.branch_id))
  ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'permission denied: undismiss_penalty_threshold'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT withdrawal_dismissed_at INTO v_dismissed_at
    FROM public.student_profiles WHERE id = p_student_id FOR UPDATE;

  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_a_student'); END IF;
  IF v_dismissed_at IS NULL THEN RETURN jsonb_build_object('status', 'not_dismissed'); END IF;

  UPDATE public.student_profiles
  SET withdrawal_dismissed_at = NULL,
      withdrawal_dismissed_reason = NULL,
      withdrawal_dismissed_net = NULL
  WHERE id = p_student_id;

  IF (public.penalty_quarter_state_internal(p_student_id)->>'net')::int >= 30 THEN
    RETURN jsonb_build_object('status', 'undismissed',
                              'threshold', public.handle_penalty_threshold(p_student_id));
  END IF;

  RETURN jsonb_build_object('status', 'undismissed', 'threshold', NULL);
END $$;

REVOKE ALL ON FUNCTION public.undismiss_penalty_threshold(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undismiss_penalty_threshold(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.undismiss_penalty_threshold(uuid) TO authenticated, service_role;


-- =============================================================
-- 6) withdrawal_notified_at 을 지우는 경로 — cancel_withdrawal_review
-- =============================================================
-- 이 함수는 cancel_point 안에서 net<30 이 되면 자동 호출된다. TS 계층 통합만으로는
-- 막히지 않으므로 함수 본문에 직접 넣어야 한다.
--
-- 빠뜨렸을 때의 사고:
--   통보된 학생 → 벌점 취소로 마크 해제(notified_at 잔존) → 재판정
--   → required_at 이 다시 채워지는 순간 관리자 조작 없이 배너·푸시 부활
--   그리고 notify_withdrawal_classification 의 가드(notified_at IS NULL)에 걸려
--   관리자가 '통보' 를 눌러도 아무 일도 일어나지 않는다.
CREATE OR REPLACE FUNCTION public.cancel_withdrawal_review(p_student_id uuid, p_restore_reward boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
      withdrawal_required_reason = NULL,
      withdrawal_notified_at = NULL   -- 신규: 마크와 함께 통보 기록도 지운다
  WHERE id = p_student_id;

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

REVOKE ALL ON FUNCTION public.cancel_withdrawal_review(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_withdrawal_review(uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_withdrawal_review(uuid, boolean) TO authenticated, service_role;


-- =============================================================
-- 7) 상품권 자동 발급 — 스킵 조건을 "통보 기준" 으로
-- =============================================================
-- 기존에는 withdrawal_required_at 이 찍히는 즉시 상품권 자동 발급이 멈췄다.
-- 판정이 자동화되면 통보 전에도 멈추게 되어, 학생이 "상품권이 안 나온다" 로
-- 눈치채면 통보 게이트가 반쪽이 된다. 통보 전에는 부작용이 없어야 한다.
CREATE OR REPLACE FUNCTION public.ensure_redemption_slots(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_review_at timestamptz;
  v_required_at timestamptz;
  v_notified_at timestamptz;
  v_balance int;
  v_queue_count int;
  v_deficit int;
BEGIN
  PERFORM 1 FROM public.student_profiles WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_a_student');
  END IF;

  SELECT withdrawal_review_at, withdrawal_required_at, withdrawal_notified_at
  INTO v_review_at, v_required_at, v_notified_at
  FROM public.student_profiles WHERE id = p_student_id;

  -- 구 정책 검토 마크는 그대로 차단. 신규 분류는 "통보된 뒤에만" 차단한다.
  IF v_review_at IS NOT NULL
     OR (v_required_at IS NOT NULL AND v_notified_at IS NOT NULL) THEN
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

REVOKE ALL ON FUNCTION public.ensure_redemption_slots(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_redemption_slots(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.ensure_redemption_slots(uuid) TO authenticated, service_role;


-- =============================================================
-- 8) 보호 컬럼 트리거 — 신규 컬럼 추가
-- =============================================================
CREATE OR REPLACE FUNCTION public.enforce_student_profile_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  IF (SELECT public.get_user_type()) = 'admin' THEN RETURN NEW; END IF;

  IF NEW.withdrawal_review_at            IS DISTINCT FROM OLD.withdrawal_review_at
     OR NEW.withdrawal_review_reason     IS DISTINCT FROM OLD.withdrawal_review_reason
     OR NEW.withdrawal_required_at       IS DISTINCT FROM OLD.withdrawal_required_at
     OR NEW.withdrawal_required_reason   IS DISTINCT FROM OLD.withdrawal_required_reason
     OR NEW.withdrawal_notified_at       IS DISTINCT FROM OLD.withdrawal_notified_at
     OR NEW.withdrawal_candidate_at      IS DISTINCT FROM OLD.withdrawal_candidate_at
     OR NEW.withdrawal_candidate_reason  IS DISTINCT FROM OLD.withdrawal_candidate_reason
     OR NEW.withdrawal_candidate_net     IS DISTINCT FROM OLD.withdrawal_candidate_net
     OR NEW.withdrawal_candidate_available_reward
                                         IS DISTINCT FROM OLD.withdrawal_candidate_available_reward
     OR NEW.withdrawal_candidate_offset_consumed
                                         IS DISTINCT FROM OLD.withdrawal_candidate_offset_consumed
     OR NEW.withdrawal_dismissed_at      IS DISTINCT FROM OLD.withdrawal_dismissed_at
     OR NEW.withdrawal_dismissed_reason  IS DISTINCT FROM OLD.withdrawal_dismissed_reason
     OR NEW.withdrawal_dismissed_net     IS DISTINCT FROM OLD.withdrawal_dismissed_net
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
-- 9) 승인제 잔재 제거
-- =============================================================
DROP FUNCTION IF EXISTS public.approve_penalty_threshold(uuid);
DROP FUNCTION IF EXISTS public.dismiss_penalty_threshold(uuid, text);


-- =============================================================
-- 10) 상계 되돌리기 — clamp 오탐 수정
-- =============================================================
-- still_required 판정을 clamp 전 원합(net_raw)으로 바꾼다. 전액 상계 후 벌점을
-- 취소하는 가장 흔한 경우에 되돌리기가 거부되던 문제를 고친다(평생 1회에서는
-- 이 오탐이 상계 자격 영구 박탈로 이어진다).
--
-- ⚠️ 한계: 되돌릴 금액(state->>'offset')은 여전히 분기 한정이다. 지난 분기 상계는
--    'no_offset' 이 반환되어 되돌릴 수 없고 소진 플래그도 풀리지 않는다.
--    현재 지난 분기 상계는 퇴원자 1건뿐이라 실제 문제는 2026-09-01 이후 발생한다.
--    근본 해결(points.reverts_point_id 로 상계↔되돌리기를 명시 연결)은 후속 범위.
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
  v_net_raw int;
  v_offset int;
BEGIN
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
    RAISE EXCEPTION 'permission denied: maybe_revert_penalty_offset'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM 1 FROM public.student_profiles WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_a_student'); END IF;

  v_state := public.penalty_quarter_state_internal(p_student_id);
  v_net := (v_state->>'net')::int;
  v_net_raw := (v_state->>'net_raw')::int;
  v_offset := (v_state->>'offset')::int;

  IF v_offset <= 0 THEN RETURN jsonb_build_object('status', 'no_offset'); END IF;

  -- clamp 전 원합으로 판정한다
  IF (v_net_raw + v_offset) >= 30 THEN
    RETURN jsonb_build_object('status', 'still_required', 'net_if_reverted', v_net_raw + v_offset);
  END IF;

  INSERT INTO public.points (student_id, admin_id, type, amount, reason, is_auto, event_kind)
  VALUES (p_student_id, NULL, 'reward', v_offset, '벌점 취소로 상계 되돌림', true, 'offset_against_penalty_revert');

  INSERT INTO public.points (student_id, admin_id, type, amount, reason, is_auto, event_kind)
  VALUES (p_student_id, NULL, 'penalty', v_offset, '벌점 취소로 상계 되돌림', true, 'offset_against_penalty_revert');

  UPDATE public.student_profiles
  SET penalty_offset_in_quarter_total = GREATEST(0, penalty_offset_in_quarter_total - v_offset)
  WHERE id = p_student_id;

  -- 상점이 복구됐으므로 상품권 슬롯을 다시 확인한다
  PERFORM public.ensure_redemption_slots(p_student_id);

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
-- 11) 부여 전 미리보기 — 대기 보호 해제 + 전액 상계 원칙 반영
-- =============================================================
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
    -- 전액 상계가 가능할 때만 상계한다
    v_offset_estimate := CASE
      WHEN v_consumed THEN 0
      WHEN v_available >= v_after THEN v_after
      ELSE 0
    END;
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
