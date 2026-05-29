-- 멘토링/클리닉/상담 결과 기록
--
-- 확정된 멘토링/상담 신청에 대해 관리자가 실제 상담 결과를 기록.
-- 몰입도 리포트의 상담 카드에 해당 주차 기록으로 표시.
--
-- 별도 테이블로 분리한 이유: mentoring_applications 의 UPDATE RLS 가
-- 본인/학부모/admin 모두 허용하고 Postgres RLS 는 컬럼 단위 보호가 불가하므로,
-- 같은 테이블 컬럼에 두면 학생이 자기 상담 결과를 임의 수정할 수 있음.
-- 여기서는 쓰기를 admin 전용으로 제한한다.

CREATE TABLE IF NOT EXISTS public.mentoring_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE
    REFERENCES public.mentoring_applications(id) ON DELETE CASCADE,
  result_note text NOT NULL,
  recorded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mentoring_results_application
  ON public.mentoring_results (application_id);

ALTER TABLE public.mentoring_results ENABLE ROW LEVEL SECURITY;

-- 학생: 본인 신청의 결과 SELECT
DROP POLICY IF EXISTS mr_student_select ON public.mentoring_results;
CREATE POLICY mr_student_select ON public.mentoring_results
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.mentoring_applications app
    WHERE app.id = public.mentoring_results.application_id
      AND app.student_id = auth.uid()
  ));

-- 학부모: 자녀 신청의 결과 SELECT
DROP POLICY IF EXISTS mr_parent_select ON public.mentoring_results;
CREATE POLICY mr_parent_select ON public.mentoring_results
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.mentoring_applications app
    JOIN public.parent_student_links psl
      ON psl.student_id = app.student_id
    WHERE app.id = public.mentoring_results.application_id
      AND psl.parent_id = auth.uid()
  ));

-- 관리자: 같은 branch(또는 슈퍼관리자) — SELECT/INSERT/UPDATE/DELETE
-- 신청 대상 학생의 branch 로 판정.
DROP POLICY IF EXISTS mr_admin_select ON public.mentoring_results;
CREATE POLICY mr_admin_select ON public.mentoring_results
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.mentoring_applications app
    JOIN public.profiles student ON student.id = app.student_id
    JOIN public.profiles admin ON admin.id = auth.uid()
    WHERE app.id = public.mentoring_results.application_id
      AND admin.user_type = 'admin'
      AND (admin.is_super_admin = true OR admin.branch_id = student.branch_id)
  ));

DROP POLICY IF EXISTS mr_admin_insert ON public.mentoring_results;
CREATE POLICY mr_admin_insert ON public.mentoring_results
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.mentoring_applications app
    JOIN public.profiles student ON student.id = app.student_id
    JOIN public.profiles admin ON admin.id = auth.uid()
    WHERE app.id = public.mentoring_results.application_id
      AND admin.user_type = 'admin'
      AND (admin.is_super_admin = true OR admin.branch_id = student.branch_id)
  ));

DROP POLICY IF EXISTS mr_admin_update ON public.mentoring_results;
CREATE POLICY mr_admin_update ON public.mentoring_results
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.mentoring_applications app
    JOIN public.profiles student ON student.id = app.student_id
    JOIN public.profiles admin ON admin.id = auth.uid()
    WHERE app.id = public.mentoring_results.application_id
      AND admin.user_type = 'admin'
      AND (admin.is_super_admin = true OR admin.branch_id = student.branch_id)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.mentoring_applications app
    JOIN public.profiles student ON student.id = app.student_id
    JOIN public.profiles admin ON admin.id = auth.uid()
    WHERE app.id = public.mentoring_results.application_id
      AND admin.user_type = 'admin'
      AND (admin.is_super_admin = true OR admin.branch_id = student.branch_id)
  ));

DROP POLICY IF EXISTS mr_admin_delete ON public.mentoring_results;
CREATE POLICY mr_admin_delete ON public.mentoring_results
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.mentoring_applications app
    JOIN public.profiles student ON student.id = app.student_id
    JOIN public.profiles admin ON admin.id = auth.uid()
    WHERE app.id = public.mentoring_results.application_id
      AND admin.user_type = 'admin'
      AND (admin.is_super_admin = true OR admin.branch_id = student.branch_id)
  ));

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.touch_mentoring_results_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mentoring_results_touch_updated_at ON public.mentoring_results;
CREATE TRIGGER mentoring_results_touch_updated_at
  BEFORE UPDATE ON public.mentoring_results
  FOR EACH ROW EXECUTE FUNCTION public.touch_mentoring_results_updated_at();

COMMENT ON TABLE public.mentoring_results IS
  '멘토링/클리닉/상담 결과 기록. 관리자만 작성, 본인/자녀/관리자 조회. 몰입도 리포트 상담 카드에 표시.';
