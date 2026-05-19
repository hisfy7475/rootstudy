-- 항목 2·4: reward_redemptions 테이블 (상품권 발급 큐)
--
-- 상태 의미:
--   requested            — 학생이 직접 신청
--   auto_pending         — 30점 도달 엣지케이스에서 시스템이 자동 생성
--   issued               — 관리자가 코드 발급 완료
--   rejected             — 발급 거부
--   cancelled_by_revert  — 검토 취소로 인한 자동 취소

CREATE TABLE IF NOT EXISTS public.reward_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'auto_pending', 'issued', 'rejected', 'cancelled_by_revert')),
  points_used int NOT NULL DEFAULT 100 CHECK (points_used = 100),
  voucher_amount int,
  voucher_code text,
  voucher_note text,
  trigger text NOT NULL DEFAULT 'student_request'
    CHECK (trigger IN ('student_request', 'threshold_auto')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  issued_at timestamptz,
  issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_at timestamptz,
  rejected_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rejected_reason text
);

CREATE INDEX IF NOT EXISTS idx_reward_redemptions_student
  ON public.reward_redemptions (student_id, status);
CREATE INDEX IF NOT EXISTS idx_reward_redemptions_pending
  ON public.reward_redemptions (status, requested_at)
  WHERE status IN ('requested', 'auto_pending');

ALTER TABLE public.reward_redemptions ENABLE ROW LEVEL SECURITY;

-- 학생: 본인 행 SELECT
DROP POLICY IF EXISTS rr_student_select ON public.reward_redemptions;
CREATE POLICY rr_student_select ON public.reward_redemptions
  FOR SELECT
  USING (student_id = auth.uid());

-- 학생: 본인 행 INSERT — status=requested, trigger=student_request, points_used=100 강제
DROP POLICY IF EXISTS rr_student_insert ON public.reward_redemptions;
CREATE POLICY rr_student_insert ON public.reward_redemptions
  FOR INSERT
  WITH CHECK (
    student_id = auth.uid()
    AND status = 'requested'
    AND points_used = 100
    AND trigger = 'student_request'
  );

-- 학부모: 자녀 행 SELECT
DROP POLICY IF EXISTS rr_parent_select ON public.reward_redemptions;
CREATE POLICY rr_parent_select ON public.reward_redemptions
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.parent_student_links psl
    WHERE psl.parent_id = auth.uid()
      AND psl.student_id = public.reward_redemptions.student_id
  ));

-- 관리자: 같은 branch SELECT/UPDATE/INSERT
-- (auto_pending 시스템 INSERT 는 service role 로, 관리자는 발급/거부 UPDATE 위주)
DROP POLICY IF EXISTS rr_admin_select ON public.reward_redemptions;
CREATE POLICY rr_admin_select ON public.reward_redemptions
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.profiles admin
    JOIN public.profiles student ON student.id = public.reward_redemptions.student_id
    WHERE admin.id = auth.uid() AND admin.user_type = 'admin'
      AND (admin.is_super_admin = true OR admin.branch_id = student.branch_id)
  ));

DROP POLICY IF EXISTS rr_admin_update ON public.reward_redemptions;
CREATE POLICY rr_admin_update ON public.reward_redemptions
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.profiles admin
    JOIN public.profiles student ON student.id = public.reward_redemptions.student_id
    WHERE admin.id = auth.uid() AND admin.user_type = 'admin'
      AND (admin.is_super_admin = true OR admin.branch_id = student.branch_id)
  ));

-- DELETE 는 누구도 불가 (append-only 원칙)

COMMENT ON TABLE public.reward_redemptions IS
  '상품권 발급 큐. 학생 신청(requested) 또는 30점 도달 자동 보호(auto_pending) → 관리자 발급(issued) / 거부(rejected) / 검토취소 (cancelled_by_revert).';
