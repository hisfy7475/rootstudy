-- 항목 1·2·3·4·5·6 (BLOCKER): points 에 event_kind 컬럼 도입
--
-- 변경 요약:
-- 1) points.event_kind text NOT NULL DEFAULT 'manual' 추가
-- 2) 기존 행을 reason/preset_id/is_auto 기반으로 분류 백필
-- 3) (event_kind, amount 부호) CHECK 제약 — invariant 강제
-- 4) 분기 누적 산출용 인덱스 (student_id, type, created_at)
--
-- event_kind 분류:
--   manual                    — 관리자 수동 부여 (양수)
--   manual_cancel             — 수동 부여 취소 (음수, type='reward' 또는 'penalty')
--   auto_weekly               — 주간 정산 (양수)
--   auto_daily_focus          — 일일 3시간 + 분류 완료 자동 상점 (양수, type='reward')
--   auto_late / auto_early    — 자동 벌점 (양수, type='penalty')
--   reset_on_threshold        — 30점 도달 상점 소멸 (음수, type='reward')
--   reset_on_threshold_revert — 검토 취소 상점 복구 (양수, type='reward')
--   redeem                    — 상품권 발급 차감 (음수, type='reward')
--
-- 정책:
-- - 음수 amount 행은 모두 type='reward'. type='penalty' AND amount<0 절대 금지.
-- - manual_cancel 만 type='penalty'에도 음수 허용(벌점 부여 취소).

ALTER TABLE public.points
  ADD COLUMN IF NOT EXISTS event_kind text NOT NULL DEFAULT 'manual';

COMMENT ON COLUMN public.points.event_kind IS
  'manual | manual_cancel | auto_weekly | auto_daily_focus | auto_late | auto_early | reset_on_threshold | reset_on_threshold_revert | redeem';

-- 백필: reason/preset_id/is_auto 기반으로 분류
UPDATE public.points p SET event_kind = CASE
  WHEN p.is_auto = false THEN 'manual'
  WHEN p.type = 'penalty' AND p.preset_id IN (
    SELECT id FROM public.penalty_presets WHERE code = 'late_checkin'
  ) THEN 'auto_late'
  WHEN p.type = 'penalty' AND p.preset_id IN (
    SELECT id FROM public.penalty_presets WHERE code = 'early_checkout'
  ) THEN 'auto_early'
  WHEN p.reason LIKE '주간%' THEN 'auto_weekly'
  ELSE 'manual'  -- 분류 불명은 manual 로 (보수적)
END
WHERE p.event_kind = 'manual';  -- 기본값만 갱신

-- 분류 후 통계 (운영 확인용 NOTICE)
DO $$
DECLARE
  v_unknown int;
BEGIN
  SELECT count(*) INTO v_unknown FROM public.points
  WHERE event_kind = 'manual' AND is_auto = true;
  IF v_unknown > 0 THEN
    RAISE NOTICE 'points 백필: is_auto=true 인데 manual 로 분류된 행 % 건 (수동 검토 필요)', v_unknown;
  END IF;
END $$;

-- 부호 invariant CHECK 제약
-- 음수 amount 는 reset_on_threshold | redeem | manual_cancel 에만 허용
ALTER TABLE public.points
  ADD CONSTRAINT points_event_kind_amount_sign CHECK (
    (event_kind IN ('reset_on_threshold', 'redeem', 'manual_cancel') AND amount < 0)
    OR
    (event_kind NOT IN ('reset_on_threshold', 'redeem', 'manual_cancel') AND amount > 0)
  );

-- 분기 누적 산출용 인덱스
CREATE INDEX IF NOT EXISTS idx_points_quarter
  ON public.points (student_id, type, created_at);
