-- profiles 에 soft delete 컬럼 추가
-- 퇴원 처리 시 행을 삭제하지 않고 withdrawn_at 만 세팅한다.
-- 이유: meal_orders.student_id 가 ON DELETE RESTRICT 라 모의고사 신청 이력이 있는 학생은
-- hard delete 가 실패하고, 또 클라이언트 요구상 모의고사 응시·결제 기록은 그대로 보존되어야 함.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS withdrawn_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS withdrawn_by uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS withdrawn_reason text NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_active
  ON public.profiles (user_type)
  WHERE withdrawn_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_withdrawn
  ON public.profiles (withdrawn_at)
  WHERE withdrawn_at IS NOT NULL;
