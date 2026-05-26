-- 상점 100점 자동 큐 진입
--
-- 정책 변경: 상점 잔액 100점 달성 시 reward_redemptions 행이 자동으로
-- 생성되어 운영자가 한 화면에서 모든 발급 대상 학생을 처리할 수 있도록 함.
-- 학생 직접 신청(request_redemption) 경로는 비활성화하여 진입 경로를 일원화.
--
-- 구성:
--   1. status/trigger CHECK 제약 확장 (cancelled_by_balance, auto_threshold_100)
--   2. ensure_redemption_slots(p_student_id)  — 잔액 기반 슬롯 자동 보강
--   3. cleanup_redemption_slots(p_student_id) — 잔액 부족 시 슬롯 자동 cancel
--   4. AFTER INSERT 트리거 — 양수 reward 부여 시 ensure 호출
--   5. AFTER DELETE 트리거 — 양수 reward 삭제 시 cleanup 호출
--   6. cancel_withdrawal_review OR REPLACE — 끝에 ensure 호출 추가
--   7. cancel_point OR REPLACE — reward cancel 시 cleanup 호출 추가
--   8. request_redemption OR REPLACE — RAISE EXCEPTION (비활성화)
--   9. 백필 DO 블록

-- =============================================
-- 1. CHECK 제약 확장
-- =============================================
ALTER TABLE public.reward_redemptions
  DROP CONSTRAINT IF EXISTS reward_redemptions_status_check;

ALTER TABLE public.reward_redemptions
  ADD CONSTRAINT reward_redemptions_status_check
  CHECK (status = ANY (ARRAY[
    'requested'::text,
    'auto_pending'::text,
    'issued'::text,
    'rejected'::text,
    'cancelled_by_revert'::text,
    'cancelled_by_balance'::text
  ]));

ALTER TABLE public.reward_redemptions
  DROP CONSTRAINT IF EXISTS reward_redemptions_trigger_check;

ALTER TABLE public.reward_redemptions
  ADD CONSTRAINT reward_redemptions_trigger_check
  CHECK (trigger = ANY (ARRAY[
    'student_request'::text,
    'threshold_auto'::text,
    'auto_threshold_100'::text
  ]));

-- =============================================
-- 2. ensure_redemption_slots
-- =============================================
-- 학생 상점 잔액을 보고 부족한 자동 큐 슬롯(`auto_threshold_100`)을 채워 넣는다.
-- - 검토 진입 중(withdrawal_review_at IS NOT NULL)이면 skip
-- - student_profiles 행 FOR UPDATE 락으로 학생별 직렬화
-- - SECURITY DEFINER (rr_student_insert 정책 우회 + 트리거 컨텍스트 안전)
CREATE OR REPLACE FUNCTION public.ensure_redemption_slots(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_review_at timestamptz;
  v_balance int;
  v_queue_count int;
  v_deficit int;
BEGIN
  -- 학생별 직렬화
  PERFORM 1 FROM public.student_profiles WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_a_student');
  END IF;

  SELECT withdrawal_review_at INTO v_review_at
  FROM public.student_profiles WHERE id = p_student_id;

  IF v_review_at IS NOT NULL THEN
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

COMMENT ON FUNCTION public.ensure_redemption_slots(uuid) IS
  '상점 잔액 ≥ 100 자동 큐 슬롯 보강. 검토 진입 중이면 skip. 학생당 1회 호출.';

-- =============================================
-- 3. cleanup_redemption_slots
-- =============================================
-- reward 삭제 등으로 잔액이 줄어 큐×100 보다 작아진 경우, 자동 생성된
-- (`auto_threshold_100`) 슬롯만 가장 최근 것부터 cancelled_by_balance 처리.
-- - 'requested'(학생 직접 신청 legacy), 'threshold_auto'(30점 보호)는 건드리지 않음
CREATE OR REPLACE FUNCTION public.cleanup_redemption_slots(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance int;
  v_active_queue int;
  v_excess int;
  v_cancelled int := 0;
BEGIN
  PERFORM 1 FROM public.student_profiles WHERE id = p_student_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_a_student');
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_balance
  FROM public.points
  WHERE student_id = p_student_id AND type = 'reward';

  SELECT COUNT(*) INTO v_active_queue
  FROM public.reward_redemptions
  WHERE student_id = p_student_id AND status IN ('requested', 'auto_pending');

  v_excess := v_active_queue - (v_balance / 100);

  IF v_excess > 0 THEN
    WITH targets AS (
      SELECT id FROM public.reward_redemptions
      WHERE student_id = p_student_id
        AND status = 'auto_pending'
        AND trigger = 'auto_threshold_100'
      ORDER BY requested_at DESC
      LIMIT v_excess
    )
    UPDATE public.reward_redemptions
    SET status = 'cancelled_by_balance',
        rejected_at = now(),
        rejected_reason = '상점 잔액 부족으로 자동 취소'
    WHERE id IN (SELECT id FROM targets);
    GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'status', 'cleaned',
    'balance', v_balance,
    'queue_before', v_active_queue,
    'cancelled', v_cancelled
  );
END $$;

GRANT EXECUTE ON FUNCTION public.cleanup_redemption_slots(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.cleanup_redemption_slots(uuid) IS
  '잔액 < 큐×100 인 경우 auto_threshold_100 슬롯만 cancelled_by_balance 처리.';

-- =============================================
-- 4. AFTER INSERT 트리거 (양수 reward 부여 시 ensure)
-- =============================================
CREATE OR REPLACE FUNCTION public.auto_enqueue_on_reward_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type = 'reward' AND NEW.amount > 0 THEN
    PERFORM public.ensure_redemption_slots(NEW.student_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_auto_enqueue_on_reward_insert ON public.points;
CREATE TRIGGER trg_auto_enqueue_on_reward_insert
  AFTER INSERT ON public.points
  FOR EACH ROW EXECUTE FUNCTION public.auto_enqueue_on_reward_insert();

-- =============================================
-- 5. AFTER DELETE 트리거 (양수 reward 삭제 시 cleanup)
-- =============================================
CREATE OR REPLACE FUNCTION public.cleanup_redemption_on_reward_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.type = 'reward' AND OLD.amount > 0 THEN
    PERFORM public.cleanup_redemption_slots(OLD.student_id);
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_cleanup_redemption_on_reward_delete ON public.points;
CREATE TRIGGER trg_cleanup_redemption_on_reward_delete
  AFTER DELETE ON public.points
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_redemption_on_reward_delete();

-- =============================================
-- 6. cancel_withdrawal_review OR REPLACE — 끝에 ensure 호출 추가
-- =============================================
-- 원본: supabase/migrations/20260520001000_threshold_rpcs.sql L190-244
-- 변경: 함수 마지막에 ensure_redemption_slots 명시 호출 (잔액 복구 + 기존 큐 cancel
--       이후 잔액 ≥ 100 이면 새 auto_threshold_100 슬롯 자동 생성)
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
  v_ensure_result jsonb;
BEGIN
  UPDATE public.student_profiles
  SET withdrawal_review_at = NULL,
      withdrawal_review_reason = NULL
  WHERE id = p_student_id AND withdrawal_review_at IS NOT NULL
  RETURNING threshold_consumed_in_quarter_at INTO v_consumed_at;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_in_review');
  END IF;

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

  -- 검토 취소 직후 잔액 ≥ 100 이면 새 auto_threshold_100 슬롯 자동 진입.
  -- (b) 양수 reward INSERT 시 트리거가 발동하지만 (c) auto_pending cancel 이전
  -- 시점이라 큐 카운트에 기존 행이 포함되어 슬롯이 생성되지 않을 수 있음.
  -- 명시 호출로 최종 정합 보장.
  v_ensure_result := public.ensure_redemption_slots(p_student_id);

  RETURN jsonb_build_object(
    'status', 'cancelled',
    'restored_reward', v_burnt_amount,
    'cancelled_pending', v_cancelled_pending,
    'ensure_result', v_ensure_result
  );
END $$;

GRANT EXECUTE ON FUNCTION public.cancel_withdrawal_review(uuid, boolean)
  TO authenticated, service_role;

-- =============================================
-- 7. cancel_point OR REPLACE — reward cancel 시 cleanup 호출
-- =============================================
-- 원본: supabase/migrations/20260520002000_protected_event_kind_delete.sql L44-101
-- 변경: 함수 끝에 v_original.type='reward' 인 경우 cleanup_redemption_slots 호출.
--       (음수 INSERT 라 트리거의 amount>0 조건에서 skip 되므로 명시 호출 필요)
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
  v_total_after int;
  v_review_revert_result jsonb := NULL;
  v_cleanup_result jsonb := NULL;
BEGIN
  SELECT * INTO v_original FROM public.points WHERE id = p_point_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;

  IF v_original.event_kind IN (
    'reset_on_threshold', 'reset_on_threshold_revert',
    'redeem', 'manual_cancel', 'auto_daily_focus'
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
    SELECT COALESCE(SUM(amount), 0) INTO v_total_after
    FROM public.points
    WHERE student_id = v_original.student_id
      AND type = 'penalty'
      AND created_at >= v_quarter_start;

    IF v_total_after < 30 THEN
      v_review_revert_result := public.cancel_withdrawal_review(v_original.student_id, true);
    END IF;
  END IF;

  -- reward 취소로 잔액이 줄어든 경우 자동 큐 슬롯 정리
  IF v_original.type = 'reward' THEN
    v_cleanup_result := public.cleanup_redemption_slots(v_original.student_id);
  END IF;

  RETURN jsonb_build_object(
    'status', 'cancelled',
    'original_id', v_original.id,
    'quarter_total_after', v_total_after,
    'review_revert', v_review_revert_result,
    'cleanup', v_cleanup_result
  );
END $$;

GRANT EXECUTE ON FUNCTION public.cancel_point(uuid, uuid, text)
  TO authenticated, service_role;

-- =============================================
-- 8. request_redemption OR REPLACE — 비활성화
-- =============================================
-- 정책 변경: 상점 100점 달성 시 자동으로 큐에 진입하므로 학생 직접 신청 경로 제거.
-- RPC 자체는 보존하되 항상 예외를 발생시켜 외부/모바일 호출도 차단.
CREATE OR REPLACE FUNCTION public.request_redemption(p_student_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION '상품권 신청은 자동 처리됩니다. 상점 100점 달성 시 발급 대기열에 자동 등록됩니다.'
    USING ERRCODE = 'P0001';
END $$;

COMMENT ON FUNCTION public.request_redemption(uuid) IS
  '[비활성화 2026-05-26] 상점 100점 자동 큐 진입 정책으로 대체. 호출 시 예외 발생.';

-- =============================================
-- 9. 백필
-- =============================================
-- 정책 변경 시점에 100점 이상 보유한 학생에게 자동 큐 슬롯 생성.
DO $$
DECLARE
  r record;
  v_total_created int := 0;
  v_result jsonb;
BEGIN
  FOR r IN
    SELECT pr.id, pr.name FROM public.profiles pr
    WHERE pr.user_type = 'student'
      AND (SELECT COALESCE(SUM(amount), 0) FROM public.points
           WHERE student_id = pr.id AND type = 'reward') >= 100
  LOOP
    v_result := public.ensure_redemption_slots(r.id);
    v_total_created := v_total_created + COALESCE((v_result->>'created')::int, 0);
  END LOOP;

  RAISE NOTICE '[backfill] auto_threshold_100 슬롯 % 건 생성', v_total_created;
END $$;
