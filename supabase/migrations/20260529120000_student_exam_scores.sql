-- 학생 성적(모의고사/학평) 입력·관리
--
-- 관리자가 학생별 시험 성적을 과목 단위로 입력하고, 몰입도 리포트에 자동 반영.
-- "회차" = (exam_name, exam_date) 그룹. 주차에 묶지 않고 시험일 기준 독립 저장.

CREATE TABLE IF NOT EXISTS public.student_exam_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  exam_name text NOT NULL,                      -- 시험명 (예: 6월 모의고사)
  exam_type text NOT NULL DEFAULT '모의고사',    -- '모의고사' | '학평' 등
  exam_date date NOT NULL,                       -- 시험일 (KST 날짜)
  subject text NOT NULL,                         -- 과목명 (국어/수학/영어/탐구 등)
  raw_score numeric(5,1),                        -- 원점수
  grade smallint,                                -- 등급 1~9
  percentile numeric(5,1),                       -- 백분위 0~100
  standard_score smallint,                       -- 표준점수
  memo text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_grade_range CHECK (grade IS NULL OR (grade BETWEEN 1 AND 9)),
  CONSTRAINT exam_percentile_range CHECK (percentile IS NULL OR (percentile BETWEEN 0 AND 100))
);

CREATE INDEX IF NOT EXISTS idx_exam_scores_student_date
  ON public.student_exam_scores (student_id, exam_date DESC);
CREATE INDEX IF NOT EXISTS idx_exam_scores_student_subject_date
  ON public.student_exam_scores (student_id, subject, exam_date);

ALTER TABLE public.student_exam_scores ENABLE ROW LEVEL SECURITY;

-- 학생: 본인 행 SELECT
DROP POLICY IF EXISTS ses_student_select ON public.student_exam_scores;
CREATE POLICY ses_student_select ON public.student_exam_scores
  FOR SELECT USING (student_id = auth.uid());

-- 학부모: 자녀 행 SELECT
DROP POLICY IF EXISTS ses_parent_select ON public.student_exam_scores;
CREATE POLICY ses_parent_select ON public.student_exam_scores
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.parent_student_links psl
    WHERE psl.parent_id = auth.uid()
      AND psl.student_id = public.student_exam_scores.student_id
  ));

-- 관리자: 같은 branch(또는 슈퍼관리자) — SELECT/INSERT/UPDATE/DELETE
-- daily_focus_evaluations 의 admin 판정 패턴과 동일.
DROP POLICY IF EXISTS ses_admin_select ON public.student_exam_scores;
CREATE POLICY ses_admin_select ON public.student_exam_scores
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles admin
    JOIN public.profiles student ON student.id = public.student_exam_scores.student_id
    WHERE admin.id = auth.uid() AND admin.user_type = 'admin'
      AND (admin.is_super_admin = true OR admin.branch_id = student.branch_id)
  ));

DROP POLICY IF EXISTS ses_admin_insert ON public.student_exam_scores;
CREATE POLICY ses_admin_insert ON public.student_exam_scores
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles admin
    JOIN public.profiles student ON student.id = public.student_exam_scores.student_id
    WHERE admin.id = auth.uid() AND admin.user_type = 'admin'
      AND (admin.is_super_admin = true OR admin.branch_id = student.branch_id)
  ));

DROP POLICY IF EXISTS ses_admin_update ON public.student_exam_scores;
CREATE POLICY ses_admin_update ON public.student_exam_scores
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.profiles admin
    JOIN public.profiles student ON student.id = public.student_exam_scores.student_id
    WHERE admin.id = auth.uid() AND admin.user_type = 'admin'
      AND (admin.is_super_admin = true OR admin.branch_id = student.branch_id)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.profiles admin
    JOIN public.profiles student ON student.id = public.student_exam_scores.student_id
    WHERE admin.id = auth.uid() AND admin.user_type = 'admin'
      AND (admin.is_super_admin = true OR admin.branch_id = student.branch_id)
  ));

DROP POLICY IF EXISTS ses_admin_delete ON public.student_exam_scores;
CREATE POLICY ses_admin_delete ON public.student_exam_scores
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.profiles admin
    JOIN public.profiles student ON student.id = public.student_exam_scores.student_id
    WHERE admin.id = auth.uid() AND admin.user_type = 'admin'
      AND (admin.is_super_admin = true OR admin.branch_id = student.branch_id)
  ));

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.touch_student_exam_scores_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS student_exam_scores_touch_updated_at ON public.student_exam_scores;
CREATE TRIGGER student_exam_scores_touch_updated_at
  BEFORE UPDATE ON public.student_exam_scores
  FOR EACH ROW EXECUTE FUNCTION public.touch_student_exam_scores_updated_at();

COMMENT ON TABLE public.student_exam_scores IS
  '학생 시험 성적(모의고사/학평). 관리자가 과목 단위로 입력, 몰입도 리포트에 표시.';
