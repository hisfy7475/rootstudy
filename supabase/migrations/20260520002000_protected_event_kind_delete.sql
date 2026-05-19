-- 항목 1·2·4: append-only 보호 + cancelPoint RPC
--
-- BLOCKER 해결:
-- 기존 deletePoint/deletePointsByFilter 가 모든 points 행을 물리 DELETE 하던 것을
-- 다음으로 제한:
--   1) protected event_kind (reset_on_threshold, reset_on_threshold_revert,
--      redeem, manual_cancel, auto_daily_focus) 는 DB 레벨에서 DELETE 거부
--   2) 나머지 event_kind 행 삭제는 허용하되 cancelPoint RPC 권장 (append-only)
--
-- cancel_point(p_point_id, p_admin_id, p_reason):
--   - 원본 행에 대응하는 음수 amount 행을 event_kind='manual_cancel' 로 INSERT
--   - type='penalty' 취소 시 invariant 위반 가능 (점수가 음수가 되지 않도록)
--   - 부여 후 임계치 재계산: 분기 누적이 30점 미만으로 떨어지면 cancel_withdrawal_review

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
    'auto_daily_focus'
  ) THEN
    RAISE EXCEPTION 'points 행은 event_kind=% 라 삭제할 수 없습니다. cancel_point RPC 로 취소 행 INSERT 하세요. (id=%)',
      OLD.event_kind, OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_protect_points_event_kind_delete ON public.points;
CREATE TRIGGER trg_protect_points_event_kind_delete
  BEFORE DELETE ON public.points
  FOR EACH ROW EXECUTE FUNCTION public.protect_points_event_kind_delete();


-- cancelPoint RPC
-- 원본 행이 manual/auto_late/auto_early/auto_weekly 인 경우만 허용.
-- (protected event_kind 는 BEFORE DELETE 트리거와 일관되게 거부)
-- 음수 행 INSERT 후 type='penalty' 라면 분기 누적 재계산 → 30점 미만이면 자동 검토 취소.
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

  -- penalty 취소 시 분기 누적 재계산 → 30점 미만이면 자동 검토 취소 + 상점 복구
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

  RETURN jsonb_build_object(
    'status', 'cancelled',
    'original_id', v_original.id,
    'quarter_total_after', v_total_after,
    'review_revert', v_review_revert_result
  );
END $$;

GRANT EXECUTE ON FUNCTION public.cancel_point(uuid, uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.cancel_point(uuid, uuid, text) IS
  '벌점/상점 부여 취소: 음수 행 INSERT (append-only). penalty 취소로 분기 누적 < 30 되면 자동 검토 취소 + 상점 복구.';
