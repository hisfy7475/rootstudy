-- 멘토링·상담 참여 자동 상점: 부여 원장(ledger)
--
-- mentoring-reward 크론(KST 09:00)이 확정 신청 건별로 상점 1점을 부여하며,
-- "이미 처리했는가"를 이 테이블로만 판정한다(daily_focus_evaluations 와 동일 패턴).
--
-- 왜 points 의 unique 인덱스가 아니라 별도 원장인가:
--   기존 uq_points_study_date_preset (student_id, preset_id, study_date) 는
--   다음 경우에 멱등이 뚫린다 → 7일 소급 창과 결합해 이중 부여가 된다.
--     1) 학생 지점 전배  — preset 은 지점별 별개 행이라 preset_id 가 바뀐다
--     2) 슬롯 date 수정  — study_date 가 바뀐다
--     3) 프리셋 비활성/재생성 — preset_id 가 바뀐다
--     4) 관리자의 상점 물리 삭제 — 인덱스 엔트리가 사라져 재부여된다
--   application_id 를 PK 로 두면 위 넷 모두 무관해진다.
--
-- point_id 의 ON DELETE SET NULL 이 핵심:
--   관리자가 상점을 삭제해도 원장 행은 granted=true 로 남아 재부여가 막힌다.
--
-- application_id PK 는 크론 중복 실행 시 claim-first(ON CONFLICT DO NOTHING) 가드로도 쓰인다.

CREATE TABLE IF NOT EXISTS public.mentoring_reward_grants (
  -- 신청 1건 = 상점 1점 (세션당 부여). 신청이 삭제되면 원장도 함께 정리.
  application_id uuid PRIMARY KEY
    REFERENCES public.mentoring_applications(id) ON DELETE CASCADE,
  -- mentoring_applications.student_id 와 동일하게 profiles 참조
  -- (points.student_id 는 student_profiles 참조라 FK 대상이 다름 — 크론이 존재 검증)
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- 슬롯 시작 시각이 속한 학습일 (KST 06:00~익일 03:00 기준)
  study_date date NOT NULL,
  point_id uuid REFERENCES public.points(id) ON DELETE SET NULL,
  granted boolean NOT NULL DEFAULT false,
  -- 미부여 사유: withdrawn / not_approved / no_student_profile / no_preset / insert_failed
  skip_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 크론의 학습일 범위 조회용
CREATE INDEX IF NOT EXISTS idx_mentoring_reward_grants_study_date
  ON public.mentoring_reward_grants (study_date);

-- 학생/학부모 화면의 학생 단위 조회용
CREATE INDEX IF NOT EXISTS idx_mentoring_reward_grants_student
  ON public.mentoring_reward_grants (student_id, study_date DESC);

ALTER TABLE public.mentoring_reward_grants ENABLE ROW LEVEL SECURITY;

-- 학생: 본인 행 SELECT
DROP POLICY IF EXISTS mrg_student_select ON public.mentoring_reward_grants;
CREATE POLICY mrg_student_select ON public.mentoring_reward_grants
  FOR SELECT USING (student_id = auth.uid());

-- 학부모: 자녀 행 SELECT
DROP POLICY IF EXISTS mrg_parent_select ON public.mentoring_reward_grants;
CREATE POLICY mrg_parent_select ON public.mentoring_reward_grants
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.parent_student_links psl
    WHERE psl.parent_id = auth.uid()
      AND psl.student_id = public.mentoring_reward_grants.student_id
  ));

-- 관리자: 같은 branch SELECT (슈퍼관리자는 전 지점)
DROP POLICY IF EXISTS mrg_admin_select ON public.mentoring_reward_grants;
CREATE POLICY mrg_admin_select ON public.mentoring_reward_grants
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.profiles admin
    JOIN public.profiles student ON student.id = public.mentoring_reward_grants.student_id
    WHERE admin.id = auth.uid() AND admin.user_type = 'admin'
      AND (admin.is_super_admin = true OR admin.branch_id = student.branch_id)
  ));

-- INSERT/UPDATE/DELETE 는 service role (크론) 전용. 사용자 직접 변경 불가.

COMMENT ON TABLE public.mentoring_reward_grants IS
  '멘토링·상담 참여 자동 상점 부여 원장. mentoring-reward 크론(KST 09:00)이 확정 신청 건별로 INSERT. application_id PK 가 멱등·동시성 가드를 겸한다.';

COMMENT ON COLUMN public.mentoring_reward_grants.point_id IS
  'ON DELETE SET NULL — 관리자가 상점을 삭제해도 원장 행(granted=true)은 남아 재부여를 막는다.';
