-- 항목 1·2·5·6: student_profiles 에 임계치/검토/첫등원/dedupe 컬럼 추가
--
-- 변경 요약:
-- - withdrawal_review_at        — 30점 도달 검토 진입 시점
-- - withdrawal_review_reason    — 진입 사유 ("벌점 30점 도달 (YYYY-Q)")
-- - threshold_consumed_in_quarter_at — 분기당 소멸 1회 제한 (invariant 3)
-- - first_check_in_at           — 첫 등원일 (immutable, attendance INSERT 트리거로 머터리얼라이즈)
-- - last_warned_at_10/20/25     — 단계 알림 dedupe (invariant 4)
-- - policy_acknowledged_at      — 정책 온보딩 모달 확인 시각
--
-- 트리거:
-- - enforce_first_check_in_immutable — first_check_in_at 은 NULL→값 1회만
-- - update_first_check_in           — attendance INSERT 시 자동 머터리얼라이즈 (auto_reset 제외)

ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS withdrawal_review_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS withdrawal_review_reason text NULL,
  ADD COLUMN IF NOT EXISTS threshold_consumed_in_quarter_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS first_check_in_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_warned_at_10 timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_warned_at_20 timestamptz NULL,
  ADD COLUMN IF NOT EXISTS last_warned_at_25 timestamptz NULL,
  ADD COLUMN IF NOT EXISTS policy_acknowledged_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_student_profiles_withdrawal_review
  ON public.student_profiles (withdrawal_review_at)
  WHERE withdrawal_review_at IS NOT NULL;

-- first_check_in_at 백필 (학생 본인 check_in 만 — auto_reset 강제 퇴실/시스템 행 제외)
UPDATE public.student_profiles sp
SET first_check_in_at = (
  SELECT MIN(a.timestamp)
  FROM public.attendance a
  WHERE a.student_id = sp.id
    AND a.type = 'check_in'
    AND (a.source IS NULL OR a.source <> 'auto_reset')
)
WHERE sp.first_check_in_at IS NULL;

-- first_check_in_at immutable 트리거 (NULL → 값 1회만 허용)
CREATE OR REPLACE FUNCTION public.enforce_first_check_in_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.first_check_in_at IS NOT NULL
     AND (NEW.first_check_in_at IS NULL OR NEW.first_check_in_at <> OLD.first_check_in_at) THEN
    RAISE EXCEPTION 'first_check_in_at 은 NULL→값으로 한 번만 세팅 가능합니다. (current: %, attempted: %)',
      OLD.first_check_in_at, NEW.first_check_in_at;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_first_check_in_immutable ON public.student_profiles;
CREATE TRIGGER trg_first_check_in_immutable
  BEFORE UPDATE OF first_check_in_at ON public.student_profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_first_check_in_immutable();

-- attendance INSERT 트리거 → first_check_in_at 머터리얼라이즈
CREATE OR REPLACE FUNCTION public.update_first_check_in()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.type = 'check_in' AND (NEW.source IS NULL OR NEW.source <> 'auto_reset') THEN
    UPDATE public.student_profiles
    SET first_check_in_at = NEW.timestamp
    WHERE id = NEW.student_id AND first_check_in_at IS NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_attendance_first_check_in ON public.attendance;
CREATE TRIGGER trg_attendance_first_check_in
  AFTER INSERT ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.update_first_check_in();

COMMENT ON COLUMN public.student_profiles.withdrawal_review_at IS
  '30점 도달로 퇴원 검토 대상에 진입한 시각. NULL 이면 정상.';
COMMENT ON COLUMN public.student_profiles.threshold_consumed_in_quarter_at IS
  '같은 분기 안에서 상점 소멸이 이미 한 번 발생했음을 표시. 분기 경계 넘으면 quarterly-reset 크론이 NULL 로 리셋.';
COMMENT ON COLUMN public.student_profiles.first_check_in_at IS
  '학생 본인 첫 check_in 시각 (auto_reset 제외). 신규생 면제 판정 기준. immutable.';
