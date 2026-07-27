-- 멘토링·상담 참여 자동 상점: 지점별 reward_preset 시드
--
-- 20260520000700_daily_focus_preset_seed.sql 과 동일한 패턴.
-- 크론은 code='mentoring_attend' 로만 조회하고 is_active 는 보지 않는다
-- (관리자가 실수로 비활성화해도 부여가 조용히 멈추지 않도록).
--
-- reason 앞의 '[자동]' 접두어는 의도적이다:
--   압구정점에는 이미 '상담/멘토링 참여'(수동, 1점) 프리셋이 활성 상태다.
--   접두어 없이 '멘토링·상담 참여' 를 추가하면 부여 드롭다운에 육안 구분이
--   안 되는 두 항목이 나란히 떠서 수동 이중 부여를 유발한다.
--
-- 기존 수동 프리셋(서포터즈 멘토링 참여 / 학습코칭 참여 / 상담/멘토링 참여)은
-- 앱 밖 참여자 보정용으로 계속 필요하므로 비활성화하지 않는다.

-- 기존 전 지점 시드 (이미 있으면 skip)
INSERT INTO public.reward_presets (branch_id, amount, reason, code, is_system, sort_order, is_active)
SELECT b.id, 1, '[자동] 멘토링·상담 참여', 'mentoring_attend', true, -999, true
FROM public.branches b
WHERE NOT EXISTS (
  SELECT 1 FROM public.reward_presets rp
  WHERE rp.branch_id = b.id AND rp.code = 'mentoring_attend'
);

-- 신규 branch 자동 시드 트리거 함수 갱신 (reward 쪽에 한 줄 추가)
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
    (NEW.id, 1, '일일 학습 3시간 + 과목 분류', 'daily_focus', true, -1000, true),
    (NEW.id, 1, '[자동] 멘토링·상담 참여', 'mentoring_attend', true, -999, true)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END $$;

-- 트리거 자체는 기존 정의(trg_branch_default_presets)를 그대로 사용한다.
