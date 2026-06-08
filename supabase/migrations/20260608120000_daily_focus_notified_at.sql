-- 일일 자동 상점 알림 발송 시점 분리 (KST 03:00 적립 → KST 09:00 알림)
--
-- daily-reset 크론(KST 03:00)은 적립만 하고, 신규 daily-focus-notify 크론(KST 09:00)이
-- 알림을 발송한다. notified_at 컬럼으로 발송 여부를 추적해 멱등성을 보장한다.

ALTER TABLE public.daily_focus_evaluations
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

-- 09:00 크론 조회 최적화 (granted + 미발송)
CREATE INDEX IF NOT EXISTS idx_dfe_notify_pending
  ON public.daily_focus_evaluations (study_date)
  WHERE granted = true AND notified_at IS NULL;

-- [핵심 안전장치] 배포 시점에 이미 존재하는 granted 행은 이미 03:00에 알림을 받았으므로
-- 즉시 마킹 → 첫 09:00 크론이 과거분을 한꺼번에 재발송하는 사고를 차단한다.
UPDATE public.daily_focus_evaluations
  SET notified_at = COALESCE(notified_at, evaluated_at)
  WHERE granted = true AND notified_at IS NULL;

COMMENT ON COLUMN public.daily_focus_evaluations.notified_at IS
  '일일 상점 알림(푸시+인앱) 발송 시각. NULL이면 미발송 → daily-focus-notify 크론이 픽업.';
