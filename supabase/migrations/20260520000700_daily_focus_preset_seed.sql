-- 항목 6: 일일 자동 상점 부여용 daily_focus reward preset 시드
--
-- - 각 branch 에 (code='daily_focus', amount=1, reason='일일 학습 3시간 + 과목 분류')
--   인 reward_preset 시드 (uq_points_daily_preset 중복 차단에 필요)
-- - branches INSERT 트리거로 신규 branch 자동 시드 (기존 late_checkin/early_checkout 패턴 확장)

-- 기존 branch 들에 daily_focus preset 시드 (이미 있으면 skip)
INSERT INTO public.reward_presets (branch_id, amount, reason, code, is_system, sort_order, is_active)
SELECT b.id, 1, '일일 학습 3시간 + 과목 분류', 'daily_focus', true, -1000, true
FROM public.branches b
WHERE NOT EXISTS (
  SELECT 1 FROM public.reward_presets rp
  WHERE rp.branch_id = b.id AND rp.code = 'daily_focus'
);

-- branches INSERT 트리거 — 신규 branch 자동 시드 (penalty + reward)
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
    (NEW.id, 1, '일일 학습 3시간 + 과목 분류', 'daily_focus', true, -1000, true)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_branch_default_presets ON public.branches;
CREATE TRIGGER trg_branch_default_presets
  AFTER INSERT ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_presets_for_branch();
