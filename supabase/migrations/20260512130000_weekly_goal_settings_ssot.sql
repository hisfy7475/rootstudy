-- 항목 5 (P0): 목표학습시간 SSOT 정리
--
-- 1) weekly_goal_settings 에 (student_type_id, date_type_id) UNIQUE 제약
--    — saveWeeklyGoalSetting() 의 upsert(onConflict) 가 의존하는 제약을 명시적으로 보장
-- 2) student_types 의 데드 컬럼 vacation_weekly_hours / semester_weekly_hours DROP
--    — grep 결과 코드 0건 사용. weekly_goal_settings 가 SSOT.

-- ============================================
-- 1. weekly_goal_settings UNIQUE constraint
--    이미 중복 row 0건 확인 (2026-05-12 검증). dedupe 단계 생략.
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_weekly_goal_settings_type_date'
      AND conrelid = 'public.weekly_goal_settings'::regclass
  ) THEN
    ALTER TABLE public.weekly_goal_settings
      ADD CONSTRAINT uq_weekly_goal_settings_type_date
      UNIQUE (student_type_id, date_type_id);
  END IF;
END$$;

-- ============================================
-- 2. 데드 컬럼 제거
-- ============================================
ALTER TABLE public.student_types
  DROP COLUMN IF EXISTS vacation_weekly_hours,
  DROP COLUMN IF EXISTS semester_weekly_hours;
