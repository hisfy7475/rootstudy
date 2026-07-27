-- 일일 자동 상점(daily_focus) 프리셋 비활성화
--
-- 클라이언트 요청으로 '일일 학습 3시간 + 과목 분류' 자동 상점을 2026-08-01 학습일부터 중단한다.
-- 실제 부여 차단은 코드가 담당한다 (REWARD_RULES.dailyFocusEndDate + isDailyFocusActive()).
-- 크론은 code='daily_focus' 로만 프리셋을 찾고 is_active 를 보지 않으므로,
-- 이 마이그레이션만으로는 부여가 멈추지 않는다. 여기서 하는 일은 노출 정리뿐이다:
--   - 관리자 상벌점 부여 드롭다운에서 숨김 (getRewardPresets 가 is_active=true 만 조회)
--   - 학생 '상점 규정' 표에서 숨김 (동일 조회를 재사용)
-- → 자동 전용 항목이 목록에 남아 수동으로 잘못 부여되는 것을 막는다.
--
-- ⚠️ DELETE 금지
--   points.preset_id 에는 FK 제약이 없다. DELETE 가 에러 없이 통과하고
--   과거 부여분 917건(2026-05-20 ~ 2026-07-25)의 preset_id 가 조용히 고아가 된다.
--   반드시 is_active=false 만 사용할 것.

UPDATE public.reward_presets
SET is_active = false
WHERE code = 'daily_focus';

-- 신규 branch 자동 시드 트리거 함수 갱신
--
-- daily_focus 줄을 '삭제'하지 않고 is_active=false 로 시드하는 이유:
--   줄을 빼면 이후 생성된 지점에는 daily_focus 프리셋이 아예 없어진다. 그 상태에서
--   부여를 재개(dailyFocusEndDate=null)하면 크론의 presetByBranch.get() 이 undefined 가 되어
--   `if (didGrant && presetId)` 에서 에러 없이 조용히 스킵된다 (미부여 사유도 안 남는다).
--   프리셋을 비활성 상태로라도 남겨두면 롤백이 UPDATE 한 줄로 전 지점 동일하게 끝난다.
--   (deleteRewardPreset 의 주석이 경고하는 것과 같은 함정이다.)
--
-- 나머지 4건(penalty 2 + mentoring_attend)은 20260727120100 정의 그대로 유지한다.
CREATE OR REPLACE FUNCTION public.seed_default_presets_for_branch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO public.penalty_presets (branch_id, amount, reason, code, is_system, sort_order, is_active)
  VALUES
    (NEW.id, 1, '지각', 'late_checkin', true, -1000, true),
    (NEW.id, 1, '조기퇴실', 'early_checkout', true, -999, true)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.reward_presets (branch_id, amount, reason, code, is_system, sort_order, is_active)
  VALUES
    (NEW.id, 1, '일일 학습 3시간 + 과목 분류', 'daily_focus', true, -1000, false),
    (NEW.id, 1, '[자동] 멘토링·상담 참여', 'mentoring_attend', true, -999, true)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END $$;

-- 트리거(trg_branch_default_presets)는 20260520000700 에서 생성된 것을 그대로 사용한다.

-- =============================================
-- 롤백 (부여 재개 시)
-- =============================================
-- 1) 코드: src/lib/constants.ts 의 REWARD_RULES.dailyFocusEndDate 를 null 로 되돌린다.
--    (크론은 is_active 를 보지 않으므로 이것만으로 부여가 재개된다)
-- 2) 화면 노출까지 되돌리려면 아래 SQL 을 직접 실행한다.
--    관리자 화면에는 비활성 프리셋을 다시 켜는 UI 가 없다.
--
--   UPDATE public.reward_presets SET is_active = true WHERE code = 'daily_focus';
--
--   그리고 seed 함수의 daily_focus 줄 마지막 인자를 false → true 로 되돌린다.
