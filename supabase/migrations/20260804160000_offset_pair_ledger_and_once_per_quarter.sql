-- 1:1 상계를 상점·벌점 "한 쌍" 으로 기록 + 상계 분기당 1회 제한 + 상계 되돌리기
--
-- 배경 (클라이언트 문의 2026-08-04)
--   "장재영 학생의 상점은 14점이 차감되어 0점이 되었는데, 벌점은 -33 에서 -19 로
--    상계되지 않았습니다. 상벌점 상계는 학생 1인당 단 한번만 적용되도록."
--
--   원인: handle_penalty_threshold 가 상계 시 상점 쪽 음수 행 1개만 INSERT 했다.
--         벌점 쪽에는 대응 행이 없어서 "1:1 상계" 인데 실제로는 한쪽만 차감됐고,
--         벌점 행을 합산하는 모든 화면(주간 리포트 카드·관리자 현황·회원 상세·
--         출결 주간표·학생앱)이 영구히 상계 전 숫자를 보여줬다.
--
-- 이 마이그레이션이 하는 일
--   1) 상계를 상점·벌점 한 쌍으로 기록 (되돌리기도 한 쌍)
--   2) 파생식을 뒤집어 이중 차감 방지 — 벌점 행 합이 곧 net, 원본 = net + 상계액
--   3) 상계 1회 제한 — 소진 여부를 원장에서 파생(상계 건수 > 되돌리기 건수)
--      범위는 points_offset_limit_scope() 한 줄로 'quarter' ↔ 'lifetime' 전환
--   4) 상계 되돌리기 — 유발 벌점 취소·삭제로 상계가 불필요해지면 양쪽 복구 + 소진 해제
--   5) 기존 상계 2건에 짝 벌점 행 백필
--
-- 부호 규약 (points_event_kind_amount_sign CHECK 와 일치)
--   offset_against_penalty        : amount < 0  (상점 −X, 벌점 −X)
--   offset_against_penalty_revert : amount > 0  (상점 +X, 벌점 +X)

-- =============================================================
-- 1) 상계 1회 제한의 적용 범위
-- =============================================================
-- 클라이언트 원문은 "학생 1인당 단 한번만" 이지만 같은 문서에 "벌점 분기별 초기화" 가
-- 함께 있어 평생/분기 해석이 갈린다. 되돌릴 수 없는 방향(강제 퇴원)이므로
-- 손해가 적은 'quarter' 를 기본값으로 두고, 확인되면 이 함수 한 줄만 바꾼다.
CREATE OR REPLACE FUNCTION public.points_offset_limit_scope()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 'quarter'::text $$;

COMMENT ON FUNCTION public.points_offset_limit_scope() IS
  '상계 1회 제한 범위. quarter = 분기당 1회(기본), lifetime = 평생 1회. 전환 시 학생 공개 규정(/policy/points) 문구 수정과 공지가 필요한지 함께 확인할 것.';


-- =============================================================
-- 2) 분기 벌점 상태 — 파생식 반전
-- =============================================================
-- 변경 전: net = (벌점행 합) − (상점쪽 상계 행 합)
-- 변경 후: net = (벌점행 합)            ← 상계 행이 벌점 쪽에도 있으므로 이미 반영됨
--          offset = 벌점쪽 상계 행의 절대합
--          raw(원본) = net + offset
--
-- ⚠️ offset 은 반드시 type='penalty' 로 한정해야 한다.
--    한 쌍으로 기록되므로 event_kind 만으로 세면 상점·벌점이 둘 다 잡혀 2배가 된다.
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

  -- 벌점 행 합 = 상계가 이미 반영된 값
  SELECT COALESCE(SUM(amount), 0) INTO v_net
  FROM public.points
  WHERE student_id = p_student_id
    AND type = 'penalty'
    AND created_at >= v_quarter_start;

  -- 이번 분기 순상계액 (표시용) — 벌점 쪽 행만 센다
  SELECT COALESCE(-SUM(amount), 0) INTO v_offset
  FROM public.points
  WHERE student_id = p_student_id
    AND type = 'penalty'
    AND event_kind IN ('offset_against_penalty', 'offset_against_penalty_revert')
    AND created_at >= v_quarter_start;

  -- 소진 여부 — 상계 건수 > 되돌리기 건수. 범위는 상수 함수가 결정한다.
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
-- 3) 30점 도달 처리 — 한 쌍 기록 + 1회 제한
-- =============================================================
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
  v_reason text;
BEGIN
  PERFORM 1 FROM public.student_profiles WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_a_student');
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

  -- 1회 제한: 이미 상계를 받은 학생은 상점이 남아 있어도 상계하지 않는다.
  v_offset := CASE WHEN v_consumed THEN 0 ELSE LEAST(v_available, v_penalty_net) END;

  IF v_offset > 0 THEN
    -- 상점 쪽 (기존)
    INSERT INTO public.points (student_id, admin_id, type, amount, reason, is_auto, event_kind)
    VALUES (p_student_id, NULL, 'reward', -v_offset,
            '벌점 30점 도달로 상점 1:1 상계', true, 'offset_against_penalty');

    -- 벌점 쪽 (신규) — 이 행이 없어서 "1:1" 인데 한쪽만 차감됐다.
    INSERT INTO public.points (student_id, admin_id, type, amount, reason, is_auto, event_kind)
    VALUES (p_student_id, NULL, 'penalty', -v_offset,
            '벌점 30점 도달로 상점 1:1 상계', true, 'offset_against_penalty');

    -- write-both: 판정에는 쓰이지 않지만 롤백 안전성을 위해 카운터를 계속 갱신한다.
    UPDATE public.student_profiles
    SET penalty_offset_in_quarter_total = penalty_offset_in_quarter_total + v_offset
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
    SET withdrawal_required_at = COALESCE(withdrawal_required_at, now()),
        withdrawal_required_reason = COALESCE(withdrawal_required_reason, v_reason)
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

GRANT EXECUTE ON FUNCTION public.handle_penalty_threshold(uuid) TO authenticated, service_role;


-- =============================================================
-- 4) 상계 되돌리기
-- =============================================================
-- 1회 제한을 켜면 관리자 오부여로 상계가 발동했을 때 학생이 단 한 번의 기회를
-- 잃고 되돌릴 방법이 없다. 그래서 되돌리기는 선택이 아니라 안전장치다.
--
-- 조건: 상계를 되돌려도 net 이 30 미만이어야 한다.
--       (= 상계가 애초에 필요 없었던 상태로 복귀하는 경우에만 되돌린다)
CREATE OR REPLACE FUNCTION public.maybe_revert_penalty_offset(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_state jsonb;
  v_net int;
  v_offset int;
BEGIN
  PERFORM 1 FROM public.student_profiles WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_a_student');
  END IF;

  v_state := public.penalty_quarter_state_internal(p_student_id);
  v_net := (v_state->>'net')::int;
  v_offset := (v_state->>'offset')::int;

  IF v_offset <= 0 THEN
    RETURN jsonb_build_object('status', 'no_offset');
  END IF;

  IF (v_net + v_offset) >= 30 THEN
    -- 되돌리면 다시 30 이상이 된다 = 상계가 여전히 필요한 상태 → 유지
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
-- 5) 상벌점 취소 — 되돌리기 연결
-- =============================================================
CREATE OR REPLACE FUNCTION public.cancel_point(p_point_id uuid, p_admin_id uuid, p_reason text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_student_id uuid;
  v_original record;
  v_total_after_net int := NULL;
  v_offset_revert jsonb := NULL;
  v_review_revert_result jsonb := NULL;
  v_cleanup_result jsonb := NULL;
BEGIN
  -- 락 순서 통일: student_profiles → points (ABBA 데드락 예방)
  SELECT student_id INTO v_student_id FROM public.points WHERE id = p_point_id;
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  PERFORM 1 FROM public.student_profiles WHERE id = v_student_id FOR UPDATE;

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
    -- 상계가 불필요해졌으면 되돌린다 (상점·벌점 양쪽 복구 + 1회 제한 해제)
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
END $$;

GRANT EXECUTE ON FUNCTION public.cancel_point(uuid, uuid, text) TO authenticated, service_role;


-- =============================================================
-- 6) 부여 dry-run — 1회 제한 반영
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
  v_already_marked boolean;
  v_consumed boolean;
BEGIN
  SELECT withdrawal_review_at, withdrawal_required_at
    INTO v_review_at, v_required_at
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
    'offset_already_consumed', v_consumed,
    'protected_auto_pending', 0,
    'burnt_estimate', 0
  );
END $$;

GRANT EXECUTE ON FUNCTION public.preview_penalty(uuid, int) TO authenticated, service_role;


-- =============================================================
-- 7) 집계 — 파생식 반전 반영
-- =============================================================
DROP FUNCTION IF EXISTS public.points_summary(uuid);

CREATE FUNCTION public.points_summary(p_branch_id uuid)
RETURNS TABLE(
  student_id uuid,
  reward_total integer,
  penalty_total integer,
  net_total integer,
  reward_lifetime integer,
  reward_redeemed integer,
  reward_burnt integer,
  reward_offset integer,
  penalty_quarter integer,
  penalty_quarter_raw integer,
  penalty_offset_quarter integer,
  penalty_quarter_net integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
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
  ),
  agg AS (
    SELECT
      bs.id AS sid,
      COALESCE(SUM(CASE WHEN pt.type = 'reward' THEN pt.amount ELSE 0 END), 0)::int AS reward_total,
      -- 상계 행이 벌점 쪽에도 있으므로 이 합계는 이미 상계 반영값이다 (평생 누적)
      COALESCE(SUM(CASE WHEN pt.type = 'penalty' THEN pt.amount ELSE 0 END), 0)::int AS penalty_total,
      COALESCE(SUM(CASE WHEN pt.type = 'reward' THEN pt.amount
                        WHEN pt.type = 'penalty' THEN -pt.amount ELSE 0 END), 0)::int AS net_total,
      -- 되돌리기(양수 reward) 도 제외한다 — 복구는 "새로 획득한 상점"이 아니다.
      -- 이번 마이그레이션에서 revert 경로가 처음 실사용 가능해지므로 함께 막는다.
      COALESCE(SUM(CASE WHEN pt.type = 'reward'
                         AND pt.event_kind NOT IN (
                               'redeem','reset_on_threshold','reset_on_threshold_revert',
                               'manual_cancel','offset_against_penalty','offset_against_penalty_revert')
                        THEN pt.amount ELSE 0 END), 0)::int AS reward_lifetime,
      COALESCE(SUM(CASE WHEN pt.event_kind = 'redeem' THEN -pt.amount ELSE 0 END), 0)::int AS reward_redeemed,
      COALESCE(SUM(CASE WHEN pt.event_kind = 'reset_on_threshold' THEN -pt.amount ELSE 0 END), 0)::int AS reward_burnt,
      COALESCE(SUM(CASE WHEN pt.type = 'reward' AND pt.event_kind = 'offset_against_penalty'
                        THEN -pt.amount ELSE 0 END), 0)::int AS reward_offset,
      -- 분기 net (벌점 행 합 = 상계 반영값)
      COALESCE(SUM(CASE WHEN pt.type = 'penalty' AND pt.created_at >= v_q_start
                        THEN pt.amount ELSE 0 END), 0)::int AS q_net,
      -- 분기 순상계액 — 벌점 쪽 행만 (한 쌍이라 event_kind 만으로 세면 2배가 된다)
      COALESCE(SUM(CASE WHEN pt.type = 'penalty'
                         AND pt.event_kind IN ('offset_against_penalty','offset_against_penalty_revert')
                         AND pt.created_at >= v_q_start
                        THEN -pt.amount ELSE 0 END), 0)::int AS q_offset
    FROM branch_students bs
    LEFT JOIN public.points pt ON pt.student_id = bs.id
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
    (GREATEST(0, a.q_net) + a.q_offset)::int AS penalty_quarter,      -- 원본(상계 전)
    (GREATEST(0, a.q_net) + a.q_offset)::int AS penalty_quarter_raw,
    a.q_offset AS penalty_offset_quarter,
    GREATEST(0, a.q_net)::int AS penalty_quarter_net
  FROM agg a;
END $$;

GRANT EXECUTE ON FUNCTION public.points_summary(uuid) TO authenticated;


-- =============================================================
-- 8) 백필 — 기존 상계 건에 짝 벌점 행 추가
-- =============================================================
-- 상점 쪽 상계 행만 있고 벌점 쪽 짝이 없는 건에 대해 동일 금액·동일 시각으로 INSERT.
-- created_at 을 원본과 맞춰 분기 귀속이 변하지 않게 한다
-- (예: 2026-05-28 상계 건은 그대로 이전 분기에 남는다).
--
-- ⚠️ 퇴원 학생 제외 — prod 에 상계 행은 있는데 그 상계를 유발한 벌점 행이
--    원장에 하나도 남아 있지 않은 건이 1건 있다(2026-05-28, 이미 퇴원).
--    과거 하드 삭제의 흔적이며, 그대로 백필하면 해당 분기 벌점 합이 음수(-11)가 된다.
--    데이터가 이미 깨진 건이므로 자동 복원 대상에서 빼고 수동 정정 대상으로 남긴다.
INSERT INTO public.points (student_id, admin_id, type, amount, reason, is_auto, event_kind, created_at)
SELECT r.student_id, NULL, 'penalty', r.amount, r.reason, true, r.event_kind, r.created_at
FROM public.points r
JOIN public.profiles pr ON pr.id = r.student_id AND pr.withdrawn_at IS NULL
WHERE r.type = 'reward'
  AND r.event_kind = 'offset_against_penalty'
  AND NOT EXISTS (
    SELECT 1 FROM public.points p
    WHERE p.student_id = r.student_id
      AND p.type = 'penalty'
      AND p.event_kind = 'offset_against_penalty'
      AND p.created_at = r.created_at
  );

-- 되돌리기 건도 동일하게 (현재 0건이지만 재실행 안전성을 위해)
INSERT INTO public.points (student_id, admin_id, type, amount, reason, is_auto, event_kind, created_at)
SELECT r.student_id, NULL, 'penalty', r.amount, r.reason, true, r.event_kind, r.created_at
FROM public.points r
JOIN public.profiles pr ON pr.id = r.student_id AND pr.withdrawn_at IS NULL
WHERE r.type = 'reward'
  AND r.event_kind = 'offset_against_penalty_revert'
  AND NOT EXISTS (
    SELECT 1 FROM public.points p
    WHERE p.student_id = r.student_id
      AND p.type = 'penalty'
      AND p.event_kind = 'offset_against_penalty_revert'
      AND p.created_at = r.created_at
  );
