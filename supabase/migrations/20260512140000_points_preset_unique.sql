-- 항목 4 (P0): 상벌점 preset 도입 + KST 일자 기준 중복 부과 차단
--
-- 변경 요약:
-- 1) penalty_presets / reward_presets 에 code + is_system 컬럼 추가 (자동 부여용 식별자)
-- 2) 모든 branch 에 시스템 preset 시드 (지각·조기퇴실)
-- 3) points 에 preset_id + preset_type 컬럼 추가
-- 4) 기존 points.reason 을 (branch, reason) 매칭으로 preset_id 백필
-- 5) (student_id, preset_id, KST 일자) partial unique index 로 중복 부과 차단
--
-- 정책:
-- - "동일 항목" = preset_id 동일 (자유 텍스트 reason 비교 X)
-- - "하루 경계" = KST 캘린더 일 (00:00 ~ 24:00)
-- - custom reason (preset_id IS NULL) 부여는 중복 허용 (관리자 재량)

-- ============================================
-- 1. preset 식별자 컬럼
-- ============================================
ALTER TABLE public.penalty_presets
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

ALTER TABLE public.reward_presets
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_penalty_presets_branch_code
  ON public.penalty_presets (branch_id, code) WHERE code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reward_presets_branch_code
  ON public.reward_presets (branch_id, code) WHERE code IS NOT NULL;

-- ============================================
-- 2. 시스템 preset 시드 (각 branch 에 동일 code 로 1건씩)
-- ============================================
INSERT INTO public.penalty_presets (branch_id, amount, reason, code, is_system, sort_order, is_active)
SELECT b.id, 1, '지각', 'late_checkin', true, -1000, true
FROM public.branches b
WHERE NOT EXISTS (
  SELECT 1 FROM public.penalty_presets pp
  WHERE pp.branch_id = b.id AND pp.code = 'late_checkin'
);

INSERT INTO public.penalty_presets (branch_id, amount, reason, code, is_system, sort_order, is_active)
SELECT b.id, 1, '조기퇴실', 'early_checkout', true, -999, true
FROM public.branches b
WHERE NOT EXISTS (
  SELECT 1 FROM public.penalty_presets pp
  WHERE pp.branch_id = b.id AND pp.code = 'early_checkout'
);

-- ============================================
-- 3. points 에 preset 참조 컬럼
-- ============================================
ALTER TABLE public.points
  ADD COLUMN IF NOT EXISTS preset_id uuid,
  ADD COLUMN IF NOT EXISTS preset_type text;

COMMENT ON COLUMN public.points.preset_id IS
  '연결된 reward/penalty preset id. NULL 이면 custom reason (관리자 자유 입력).';
COMMENT ON COLUMN public.points.preset_type IS
  '''reward'' | ''penalty''. preset_id 와 함께 사용 (FK 가 폴리모픽이라 type 으로 분기).';

-- ============================================
-- 4. 백필: 동일 (branch, reason, type) 매칭으로 preset_id 채움
-- ============================================
UPDATE public.points p
SET preset_id = pp.id, preset_type = 'penalty'
FROM public.profiles pr
JOIN public.penalty_presets pp ON pp.branch_id = pr.branch_id
WHERE p.student_id = pr.id
  AND p.reason = pp.reason
  AND p.type = 'penalty'
  AND p.preset_id IS NULL;

UPDATE public.points p
SET preset_id = rp.id, preset_type = 'reward'
FROM public.profiles pr
JOIN public.reward_presets rp ON rp.branch_id = pr.branch_id
WHERE p.student_id = pr.id
  AND p.reason = rp.reason
  AND p.type = 'reward'
  AND p.preset_id IS NULL;

-- ============================================
-- 5. 백필 중복 정리 — unique index 적용 전 처리
--    동일 (student, preset, KST 일자) 의 추가 row 는 preset_id 를 NULL 로 되돌려
--    "custom reason" 으로 격리. 데이터 삭제 없이 unique 제약 만족.
-- ============================================
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY student_id, preset_id, (created_at AT TIME ZONE 'Asia/Seoul')::date
      ORDER BY created_at ASC
    ) AS rn
  FROM public.points
  WHERE preset_id IS NOT NULL
)
UPDATE public.points
SET preset_id = NULL, preset_type = NULL
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ============================================
-- 6. partial unique index — KST 일자 기준 중복 차단
--    custom reason (preset_id IS NULL) 은 적용 외
-- ============================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_points_daily_preset
  ON public.points (
    student_id,
    preset_id,
    ((created_at AT TIME ZONE 'Asia/Seoul')::date)
  )
  WHERE preset_id IS NOT NULL;

COMMENT ON INDEX public.uq_points_daily_preset IS
  '같은 학생/같은 preset/같은 KST 일자에 1건만 허용. ON CONFLICT DO NOTHING 으로 차단.';
