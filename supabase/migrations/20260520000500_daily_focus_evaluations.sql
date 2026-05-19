-- 항목 6: 일일 자동 상점 평가 결과 영속화
--
-- 매일 daily-reset 크론이 학생별 평가 결과(부여/미부여 사유)를 기록.
-- 미부여 케이스의 사유를 학생/학부모가 사후 확인 가능 (캘린더 스트립 데이터 소스).

CREATE TABLE IF NOT EXISTS public.daily_focus_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  study_date date NOT NULL,
  study_minutes int NOT NULL DEFAULT 0,
  unclassified_minutes int NOT NULL DEFAULT 0,
  is_weekday boolean NOT NULL,
  granted boolean NOT NULL DEFAULT false,
  granted_reason text,
  point_id uuid REFERENCES public.points(id) ON DELETE SET NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, study_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_focus_eval_student_date
  ON public.daily_focus_evaluations (student_id, study_date DESC);

ALTER TABLE public.daily_focus_evaluations ENABLE ROW LEVEL SECURITY;

-- 학생: 본인 행 SELECT
DROP POLICY IF EXISTS dfe_student_select ON public.daily_focus_evaluations;
CREATE POLICY dfe_student_select ON public.daily_focus_evaluations
  FOR SELECT USING (student_id = auth.uid());

-- 학부모: 자녀 행 SELECT
DROP POLICY IF EXISTS dfe_parent_select ON public.daily_focus_evaluations;
CREATE POLICY dfe_parent_select ON public.daily_focus_evaluations
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.parent_student_links psl
    WHERE psl.parent_id = auth.uid()
      AND psl.student_id = public.daily_focus_evaluations.student_id
  ));

-- 관리자: 같은 branch SELECT
DROP POLICY IF EXISTS dfe_admin_select ON public.daily_focus_evaluations;
CREATE POLICY dfe_admin_select ON public.daily_focus_evaluations
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles admin
    JOIN public.profiles student ON student.id = public.daily_focus_evaluations.student_id
    WHERE admin.id = auth.uid() AND admin.user_type = 'admin'
      AND (admin.is_super_admin = true OR admin.branch_id = student.branch_id)
  ));

-- INSERT/UPDATE 는 service role (크론) 만. 사용자 직접 변경 불가.

COMMENT ON TABLE public.daily_focus_evaluations IS
  '일일 자동 상점 평가 결과. daily-reset 크론이 학습일 종료 시 UPSERT.';
