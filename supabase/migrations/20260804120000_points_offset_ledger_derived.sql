-- 상벌점 상계 누계를 가변 카운터에서 points 원장 파생으로 전환 + 임계 판정 회귀 복구
--
-- 배경
--   20260526220000_offset_policy.sql 이 임계 판정을 net(raw − 상계누계)으로 바꿨으나,
--   20260601120000_penalty_auto_enabled_and_study_date.sql 이 상계 정책 이전 버전을 베이스로
--   give_penalty_with_threshold_check 를 재생성하면서 net 계산과 행 락을 함께 되돌렸다.
--   결과: 게이트는 raw / 실행(handle_penalty_threshold)은 net 으로 분열.
--
-- 이 마이그레이션이 하는 일
--   1) penalty_quarter_state — 상계 누계를 원장에서 파생하는 단일 계산식 (SSOT)
--   2) give_penalty_with_threshold_check — net 복구 + FOR UPDATE 락 복구
--                                        + 임계/경고 판정을 "교차식 → 상태 기반" 으로 전환
--   3) handle_penalty_threshold / preview_penalty / cancel_point — 카운터 읽기 제거
--   4) points_summary — 분기 raw/상계/net 3필드 추가 (반환 타입 변경이라 DROP 필요)
--   5) protect_points_event_kind_delete — 상계 행을 삭제 보호 목록에 추가
--   6) student_profiles 보호 컬럼 트리거 — 학생이 퇴원 마크·경고 이력을 지우지 못하게
--   7) cancel_point 락 순서 통일 (student_profiles → points) — ABBA 데드락 예방
--
-- 카운터(student_profiles.penalty_offset_in_quarter_total)는 이 단계에서 드롭하지 않는다.
--   읽기만 원장으로 옮기고 쓰기는 유지한다(write-both / read-ledger).
--   구 코드가 남아 있는 배포 창과 롤백 시 카운터가 낡으면 net 이 과대 계산되어
--   이중 상계가 발생하므로, 카운터의 분기 리셋(quarterly-reset 크론)도 함께 유지해야 한다.
--   실제 DROP 은 후속 마이그레이션에서 다운스크립트와 함께 처리한다.

-- =============================================================
-- 1) 원장 파생 계산식 (SSOT)
-- =============================================================

-- 내부용 — 인가 검사 없음. 다른 SECURITY DEFINER 함수에서만 호출한다.
-- (아래에서 PUBLIC/anon/authenticated 실행 권한을 모두 회수한다.)
CREATE OR REPLACE FUNCTION public.penalty_quarter_state_internal(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quarter_start timestamptz;
  v_raw int;
  v_offset int;
BEGIN
  v_quarter_start := public.get_current_quarter_start_kst();

  SELECT COALESCE(SUM(amount), 0) INTO v_raw
  FROM public.points
  WHERE student_id = p_student_id
    AND type = 'penalty'
    AND created_at >= v_quarter_start;

  -- 상계 행은 음수 reward, 되돌리기 행은 양수 reward.
  -- 부호를 반전해 합산한 값이 "이번 분기 순상계액" 이다.
  -- points_event_kind_amount_sign CHECK 이 두 kind 의 부호를 강제하므로 이 식이 성립한다.
  SELECT COALESCE(-SUM(amount), 0) INTO v_offset
  FROM public.points
  WHERE student_id = p_student_id
    AND event_kind IN ('offset_against_penalty', 'offset_against_penalty_revert')
    AND created_at >= v_quarter_start;

  RETURN jsonb_build_object(
    'quarter_start', v_quarter_start,
    'raw', v_raw,
    'offset', v_offset,
    -- 클램프 이유: cancel_point 는 manual_cancel 상쇄 행을 "취소 시점" 으로 INSERT 하므로,
    -- 이전 분기 벌점을 이번 분기에 취소하면 raw 가 음수로 끌린다.
    'net', GREATEST(0, v_raw - v_offset)
  );
END $$;

REVOKE ALL ON FUNCTION public.penalty_quarter_state_internal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.penalty_quarter_state_internal(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.penalty_quarter_state_internal(uuid) FROM authenticated;

-- 외부용 — 본인 / 연결 학부모 / 동일 지점 관리자 / 서비스 롤만 조회 가능.
CREATE OR REPLACE FUNCTION public.penalty_quarter_state(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid;
  v_allowed boolean := false;
BEGIN
  v_caller := auth.uid();

  IF v_caller IS NULL THEN
    -- service_role (크론·서버 액션의 admin 클라이언트) — JWT sub 없음.
    v_allowed := true;
  ELSIF v_caller = p_student_id THEN
    v_allowed := true;
  ELSIF EXISTS (
    SELECT 1 FROM public.parent_student_links l
    WHERE l.parent_id = v_caller AND l.student_id = p_student_id
  ) THEN
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
    RAISE EXCEPTION 'permission denied: penalty_quarter_state';
  END IF;

  RETURN public.penalty_quarter_state_internal(p_student_id);
END $$;

REVOKE ALL ON FUNCTION public.penalty_quarter_state(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.penalty_quarter_state(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.penalty_quarter_state(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.penalty_quarter_state(uuid) IS
  '분기 벌점 상태 { quarter_start, raw, offset, net }. 상계 누계는 points 원장에서 파생한다(가변 카운터 사용 금지).';


-- =============================================================
-- 2) 30점 도달 처리 — 카운터 읽기 제거 (쓰기는 유지: write-both)
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
  v_protected int;
  v_available int;
  v_state jsonb;
  v_penalty_net int;
  v_offset int;
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

  v_protected := v_queue_count * 100;
  v_available := GREATEST(0, v_balance - v_protected);

  -- 원장 파생 (구: student_profiles.penalty_offset_in_quarter_total 차감)
  v_state := public.penalty_quarter_state_internal(p_student_id);
  v_penalty_net := (v_state->>'net')::int;

  v_offset := LEAST(v_available, v_penalty_net);

  IF v_offset > 0 THEN
    INSERT INTO public.points (student_id, admin_id, type, amount, reason, is_auto, event_kind)
    VALUES (p_student_id, NULL, 'reward', -v_offset,
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
      'protected_queue_count', v_queue_count
    );
  ELSE
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


-- =============================================================
-- 3) 벌점 부여 — net 복구 + 락 복구 + 상태 기반 판정
-- =============================================================
--
-- 판정 방식 변경 (교차식 → 상태 기반)
--   구: IF after >= 30 AND before < 30
--       → 우회 경로(크론 직접 INSERT 등)로 이미 30을 넘긴 학생은 before 가 항상 30 이상이라
--         이후 어떤 벌점을 받아도 임계가 영원히 발동하지 않는 데드존이 생겼다.
--   신: IF net >= 30 AND 퇴원 마크 없음
--       → 구멍이 다음 부여 시 자가 치유되고, 마크가 생기면 재진입이 차단되어 수렴한다.
--
--   경고(10/20/25)도 before 조건을 제거하고 dedupe 를 기존 CAS(last_warned_at_N < 분기시작)에
--   전적으로 위임한다. before 조건은 CAS 와 중복이었다.

CREATE OR REPLACE FUNCTION public.give_penalty_with_threshold_check(
  p_student_id uuid,
  p_admin_id uuid,
  p_amount integer,
  p_reason text,
  p_preset_id uuid DEFAULT NULL::uuid,
  p_event_kind text DEFAULT 'manual'::text,
  p_study_date date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_quarter_start timestamptz;
  v_net_before int;
  v_net_after int;
  v_threshold_result jsonb := NULL;
  v_warnings jsonb := '[]'::jsonb;
  v_point_id uuid;
  v_study_date date;
  v_review_at timestamptz;
  v_required_at timestamptz;
BEGIN
  v_quarter_start := public.get_current_quarter_start_kst();

  v_study_date := COALESCE(
    p_study_date,
    ((now() AT TIME ZONE 'Asia/Seoul') - interval '6 hours')::date
  );

  -- 락 복구 (20260601 회귀로 소실됐던 것).
  -- 동시 부여를 직렬화해 경고 CAS 와 임계 판정이 어긋나지 않게 한다.
  -- 락 순서 규약: student_profiles → points (cancel_point 도 동일 순서로 통일)
  SELECT withdrawal_review_at, withdrawal_required_at
    INTO v_review_at, v_required_at
    FROM public.student_profiles
   WHERE id = p_student_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '학생 프로필이 없습니다. (student_id=%)', p_student_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  v_net_before := (public.penalty_quarter_state_internal(p_student_id)->>'net')::int;

  INSERT INTO public.points (
    student_id, admin_id, type, amount, reason,
    is_auto, preset_id, preset_type, event_kind, study_date
  )
  VALUES (
    p_student_id, p_admin_id, 'penalty', p_amount, p_reason,
    (p_event_kind LIKE 'auto_%'),
    p_preset_id,
    CASE WHEN p_preset_id IS NOT NULL THEN 'penalty' ELSE NULL END,
    p_event_kind,
    v_study_date
  )
  RETURNING id INTO v_point_id;

  -- INSERT 후 재계산 (net 은 클램프가 걸려 있어 before + amount 와 다를 수 있다)
  v_net_after := (public.penalty_quarter_state_internal(p_student_id)->>'net')::int;

  IF v_net_after >= 10 THEN
    UPDATE public.student_profiles SET last_warned_at_10 = now()
    WHERE id = p_student_id
      AND (last_warned_at_10 IS NULL OR last_warned_at_10 < v_quarter_start);
    IF FOUND THEN v_warnings := v_warnings || '"warn_10"'::jsonb; END IF;
  END IF;

  IF v_net_after >= 20 THEN
    UPDATE public.student_profiles SET last_warned_at_20 = now()
    WHERE id = p_student_id
      AND (last_warned_at_20 IS NULL OR last_warned_at_20 < v_quarter_start);
    IF FOUND THEN v_warnings := v_warnings || '"warn_20"'::jsonb; END IF;
  END IF;

  IF v_net_after >= 25 THEN
    UPDATE public.student_profiles SET last_warned_at_25 = now()
    WHERE id = p_student_id
      AND (last_warned_at_25 IS NULL OR last_warned_at_25 < v_quarter_start);
    IF FOUND THEN v_warnings := v_warnings || '"warn_25"'::jsonb; END IF;
  END IF;

  -- 상태 기반 임계: 이미 마크된 학생은 재진입하지 않는다.
  IF v_net_after >= 30 AND v_review_at IS NULL AND v_required_at IS NULL THEN
    v_threshold_result := public.handle_penalty_threshold(p_student_id);
  END IF;

  RETURN jsonb_build_object(
    'point_id', v_point_id,
    'total_before', v_net_before,
    'total_after', v_net_after,
    'warnings', v_warnings,
    'threshold', v_threshold_result
  );
END $$;

GRANT EXECUTE ON FUNCTION public.give_penalty_with_threshold_check(uuid, uuid, int, text, uuid, text, date)
  TO authenticated, service_role;


-- =============================================================
-- 4) 벌점 부여 dry-run — 카운터 읽기 제거 + 상태 기반
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
  v_total_before_net int;
  v_total_after_net int;
  v_balance int;
  v_queue_count int;
  v_protected int;
  v_available int;
  v_offset_estimate int := 0;
  v_reaches int[] := ARRAY[]::int[];
  v_will_require_withdrawal boolean := false;
  v_review_at timestamptz;
  v_required_at timestamptz;
  v_already_marked boolean;
BEGIN
  SELECT withdrawal_review_at, withdrawal_required_at
    INTO v_review_at, v_required_at
    FROM public.student_profiles WHERE id = p_student_id;

  v_already_marked := (v_review_at IS NOT NULL OR v_required_at IS NOT NULL);

  v_state := public.penalty_quarter_state_internal(p_student_id);
  v_total_before_net := (v_state->>'net')::int;
  v_total_after_net := GREATEST(0, v_total_before_net + p_amount);

  -- 예고는 "이번 부여로 새로 넘는 단계" 를 보여주므로 교차식을 유지한다.
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

  -- 실제 게이트와 동일한 상태 기반 조건으로 예측한다.
  IF v_total_after_net >= 30 AND NOT v_already_marked THEN
    v_offset_estimate := LEAST(v_available, v_total_after_net);
    v_will_require_withdrawal := (v_offset_estimate = 0);
  END IF;

  RETURN jsonb_build_object(
    'quarter_total_before', v_total_before_net,
    'quarter_total_after', v_total_after_net,
    'thresholds_reached', to_jsonb(v_reaches),
    'reaches_30', v_total_after_net >= 30 AND NOT v_already_marked,
    'current_balance', v_balance,
    'queue_count', v_queue_count,
    'offset_estimate', v_offset_estimate,
    'reward_after_offset', v_balance - v_offset_estimate,
    'penalty_after_offset_net', v_total_after_net - v_offset_estimate,
    'will_require_withdrawal', v_will_require_withdrawal,
    'already_marked', v_already_marked,
    'protected_auto_pending', 0,
    'burnt_estimate', 0
  );
END $$;

GRANT EXECUTE ON FUNCTION public.preview_penalty(uuid, int) TO authenticated, service_role;


-- =============================================================
-- 5) 상벌점 취소 — 카운터 읽기 제거 + 락 순서 통일
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
  v_review_revert_result jsonb := NULL;
  v_cleanup_result jsonb := NULL;
BEGIN
  -- 락 순서 통일: student_profiles → points.
  -- give_penalty_with_threshold_check / handle_penalty_threshold 와 순서를 맞춰
  -- ABBA 데드락(40P01)을 예방한다.
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
    -- 원장 파생 (구: student_profiles.penalty_offset_in_quarter_total 차감)
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
    'review_revert', v_review_revert_result,
    'cleanup', v_cleanup_result
  );
END $$;

GRANT EXECUTE ON FUNCTION public.cancel_point(uuid, uuid, text) TO authenticated, service_role;


-- =============================================================
-- 6) 상벌점 집계 — 분기 raw/상계/net 3필드 추가
-- =============================================================
-- RETURNS TABLE 의 컬럼 목록이 바뀌므로 CREATE OR REPLACE 로는 42P13 이 난다. DROP 필수.
-- DROP 시 GRANT 가 함께 소실되므로 아래에서 재부여한다.

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
      COALESCE(SUM(CASE WHEN pt.type = 'penalty' THEN pt.amount ELSE 0 END), 0)::int AS penalty_total,
      COALESCE(SUM(CASE WHEN pt.type = 'reward' THEN pt.amount
                        WHEN pt.type = 'penalty' THEN -pt.amount ELSE 0 END), 0)::int AS net_total,
      COALESCE(SUM(CASE WHEN pt.type = 'reward'
                         AND pt.event_kind NOT IN ('redeem','reset_on_threshold','manual_cancel','offset_against_penalty')
                        THEN pt.amount ELSE 0 END), 0)::int AS reward_lifetime,
      COALESCE(SUM(CASE WHEN pt.event_kind = 'redeem' THEN -pt.amount ELSE 0 END), 0)::int AS reward_redeemed,
      COALESCE(SUM(CASE WHEN pt.event_kind = 'reset_on_threshold' THEN -pt.amount ELSE 0 END), 0)::int AS reward_burnt,
      COALESCE(SUM(CASE WHEN pt.event_kind = 'offset_against_penalty' THEN -pt.amount ELSE 0 END), 0)::int AS reward_offset,
      -- 분기 raw (구 penalty_quarter 와 동일 — 하위 호환으로 둘 다 반환)
      COALESCE(SUM(CASE WHEN pt.type = 'penalty' AND pt.created_at >= v_q_start
                        THEN pt.amount ELSE 0 END), 0)::int AS q_raw,
      -- 분기 순상계액 — penalty_quarter_state_internal 과 동일한 파생식.
      -- (계산식이 두 벌로 갈라지면 2026-06-01 회귀와 같은 유형이 재발하므로 반드시 함께 수정할 것)
      COALESCE(SUM(CASE WHEN pt.event_kind IN ('offset_against_penalty','offset_against_penalty_revert')
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
    a.q_raw AS penalty_quarter,
    a.q_raw AS penalty_quarter_raw,
    a.q_offset AS penalty_offset_quarter,
    GREATEST(0, a.q_raw - a.q_offset)::int AS penalty_quarter_net
  FROM agg a;
END $$;

GRANT EXECUTE ON FUNCTION public.points_summary(uuid) TO authenticated;


-- =============================================================
-- 7) 원장 보호 — 상계 행을 삭제 차단 목록에 추가
-- =============================================================
-- 상계 누계를 원장에서 파생하게 되면 상계 행이 유일한 진실 원천이 된다.
-- 이 행이 하드 삭제되면 net 이 조작되므로 DB 레벨에서 막는다.
-- (cancel_point RPC 는 이미 두 kind 를 보호 목록에 두고 있었으나, DELETE 경로만 뚫려 있었다.)

CREATE OR REPLACE FUNCTION public.protect_points_event_kind_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.event_kind IN (
    'reset_on_threshold',
    'reset_on_threshold_revert',
    'redeem',
    'manual_cancel',
    'auto_daily_focus',
    'auto_vocab',
    'offset_against_penalty',
    'offset_against_penalty_revert'
  ) THEN
    RAISE EXCEPTION 'points 행은 event_kind=% 라 삭제할 수 없습니다. cancel_point RPC 로 취소 행 INSERT 하세요. (id=%)',
      OLD.event_kind, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;


-- =============================================================
-- 8) student_profiles 보호 컬럼 — 학생의 직접 UPDATE 차단
-- =============================================================
-- RLS 정책 "Students can update own student_profile" 은 qual=(auth.uid() = id) 뿐이고
-- WITH CHECK 도 컬럼 제한도 없어, 학생이 자기 행의 아무 컬럼이나 쓸 수 있다.
-- 즉 학생이 withdrawal_required_at 을 NULL 로 만들어 강제 퇴원 마크를 스스로 지울 수 있다.
-- 임계 판정 상태를 담은 컬럼만 비관리자에게 잠근다.

CREATE OR REPLACE FUNCTION public.enforce_student_profile_protected_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- service_role / 크론 (JWT sub 없음) 은 통과
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- 관리자는 통과 (RLS 가 지점 격리를 이미 처리)
  IF (SELECT public.get_user_type()) = 'admin' THEN
    RETURN NEW;
  END IF;

  IF NEW.withdrawal_review_at            IS DISTINCT FROM OLD.withdrawal_review_at
     OR NEW.withdrawal_review_reason     IS DISTINCT FROM OLD.withdrawal_review_reason
     OR NEW.withdrawal_required_at       IS DISTINCT FROM OLD.withdrawal_required_at
     OR NEW.withdrawal_required_reason   IS DISTINCT FROM OLD.withdrawal_required_reason
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

DROP TRIGGER IF EXISTS trg_student_profile_protected_columns ON public.student_profiles;
CREATE TRIGGER trg_student_profile_protected_columns
  BEFORE UPDATE ON public.student_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_student_profile_protected_columns();


COMMENT ON COLUMN public.student_profiles.penalty_offset_in_quarter_total IS
  'DEPRECATED — 판정에 사용하지 않는다. 상계 누계는 penalty_quarter_state 로 원장에서 파생한다. 롤백 안전성을 위해 쓰기와 분기 리셋만 유지 중이며 후속 마이그레이션에서 DROP 예정.';
