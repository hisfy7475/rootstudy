-- 지각/조기퇴실 자동 벌점: 관리자 ON/OFF 토글 + 학습일 기준 중복 차단
--
-- 1. penalty_presets.auto_enabled — 시스템 프리셋(지각/조기퇴실)의 자동 부과 여부.
--    기본 false(OFF). 기존 행은 DEFAULT 로 자동 false → 현재 클라이언트 요구(자동 OFF) 상태.
-- 2. points.study_date — 부과가 귀속되는 학습일(KST 06:00~익일 03:00 기준).
--    실시간 부과(앱/CAPS)와 부과 시각(created_at)·타임존이 어긋나도 학습일 단위로 1건만 보장.
-- 3. 중복 차단 unique index 를 created_at(KST 일자) → study_date 기준으로 교체.
-- 4. give_penalty_with_threshold_check 에 p_study_date 추가(미지정 시 부과 시점의 학습일).

-- ============================================
-- 1. penalty_presets.auto_enabled
-- ============================================
ALTER TABLE public.penalty_presets
  ADD COLUMN IF NOT EXISTS auto_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.penalty_presets.auto_enabled IS
  '시스템 프리셋(지각/조기퇴실)의 자동 부과 여부. 기본 false=OFF. 관리자가 지점별로 토글.';

-- ============================================
-- 2. points.study_date
-- ============================================
ALTER TABLE public.points
  ADD COLUMN IF NOT EXISTS study_date date;

COMMENT ON COLUMN public.points.study_date IS
  '부과가 귀속되는 학습일(KST 06:00 시작). 자동 벌점 중복 차단 키. 수동/기타는 부과 시점 학습일.';

-- 기존 preset 부여 행 백필 — 학습일 = (KST 시각 - 6h) 의 날짜.
UPDATE public.points
SET study_date = ((created_at AT TIME ZONE 'Asia/Seoul') - interval '6 hours')::date
WHERE study_date IS NULL
  AND preset_id IS NOT NULL;

-- ============================================
-- 3. unique index 교체 (created_at KST 일자 → study_date)
-- ============================================
-- 새 index 가 study_date 충돌(00:00~06:00 경계로 인한 학습일 겹침)에 걸려 생성 실패하지 않도록,
-- 같은 (student, preset, study_date) 중복 행은 가장 오래된 1건만 남기고 preset_id 를 NULL 로 해제.
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY student_id, preset_id, study_date
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.points
  WHERE preset_id IS NOT NULL AND study_date IS NOT NULL
)
UPDATE public.points
SET preset_id = NULL, preset_type = NULL
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

DROP INDEX IF EXISTS public.uq_points_daily_preset;

CREATE UNIQUE INDEX IF NOT EXISTS uq_points_study_date_preset
  ON public.points (student_id, preset_id, study_date)
  WHERE preset_id IS NOT NULL;

COMMENT ON INDEX public.uq_points_study_date_preset IS
  '같은 학생/같은 preset/같은 학습일에 1건만 허용. 자동 벌점 중복 차단(앱/CAPS 양쪽).';

-- ============================================
-- 4. give_penalty_with_threshold_check — p_study_date 추가
-- ============================================
-- 파라미터 수가 바뀌므로 기존 6-인자 오버로드를 제거(중복 오버로드/호출 모호성 방지).
DROP FUNCTION IF EXISTS public.give_penalty_with_threshold_check(uuid, uuid, int, text, uuid, text);

CREATE OR REPLACE FUNCTION public.give_penalty_with_threshold_check(
  p_student_id uuid,
  p_admin_id uuid,
  p_amount int,
  p_reason text,
  p_preset_id uuid DEFAULT NULL,
  p_event_kind text DEFAULT 'manual',
  p_study_date date DEFAULT NULL
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
  v_study_date date;
BEGIN
  v_quarter_start := public.get_current_quarter_start_kst();

  -- 학습일: 미지정 시 부과 시점(now)의 학습일(KST 06:00 시작)
  v_study_date := COALESCE(
    p_study_date,
    ((now() AT TIME ZONE 'Asia/Seoul') - interval '6 hours')::date
  );

  -- 1. 부여 전 분기 누적
  SELECT COALESCE(SUM(amount), 0) INTO v_total_before
  FROM public.points
  WHERE student_id = p_student_id
    AND type = 'penalty'
    AND created_at >= v_quarter_start;

  -- 2. 벌점 부여 (uq_points_study_date_preset 충돌 시 23505 raise)
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

GRANT EXECUTE ON FUNCTION public.give_penalty_with_threshold_check(uuid, uuid, int, text, uuid, text, date)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.give_penalty_with_threshold_check(uuid, uuid, int, text, uuid, text, date) IS
  '벌점 부여 + 10/20/25점 알림 dedupe + 30점 도달 트리거 + 학습일 기준 중복 차단. 단일 트랜잭션.';
