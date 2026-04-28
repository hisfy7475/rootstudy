-- 멘토링/클리닉/상담 통합 + 신청 폼 확장
-- - mentoring_slots.type 에 'consult' 추가
-- - mentors 에 다중 과목(subjects) + 한 줄 프로필(headline)
-- - mentoring_applications 에 content / selected_subject / attachments 신설

-- 1) 슬롯 type CHECK 확장
ALTER TABLE public.mentoring_slots
  DROP CONSTRAINT IF EXISTS mentoring_slots_type_check;
ALTER TABLE public.mentoring_slots
  ADD CONSTRAINT mentoring_slots_type_check
  CHECK (type IN ('mentoring', 'clinic', 'consult'));

-- 2) 멘토 다중 과목 + 한 줄 프로필
ALTER TABLE public.mentors
  ADD COLUMN IF NOT EXISTS subjects text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS headline text;

-- 기존 단수 subject 데이터를 subjects[]로 백필
UPDATE public.mentors
   SET subjects = ARRAY[subject]
 WHERE subject IS NOT NULL
   AND (subjects IS NULL OR subjects = '{}');

-- 3) 신청 폼 확장
ALTER TABLE public.mentoring_applications
  ADD COLUMN IF NOT EXISTS content text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS selected_subject text,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 기존 note 데이터를 content로 백필 (note 컬럼은 후속 정리)
UPDATE public.mentoring_applications
   SET content = COALESCE(note, '')
 WHERE content = '' AND note IS NOT NULL;

-- attachments 형식 가드: jsonb array, 길이 <= 3
ALTER TABLE public.mentoring_applications
  DROP CONSTRAINT IF EXISTS mentoring_applications_attachments_check;
ALTER TABLE public.mentoring_applications
  ADD CONSTRAINT mentoring_applications_attachments_check
  CHECK (
    jsonb_typeof(attachments) = 'array'
    AND jsonb_array_length(attachments) <= 3
  );
