-- 상담 리포트에 "상담/멘토링 레터 추가 메모/첨언" 자유 서술 컬럼 추가.
-- 기존 guidance_notes는 "상담/멘토링 레터"로 라벨이 재정의되며, 본 컬럼은 그 옆에
-- 별도의 자유 입력 필드로 노출된다. 자동 채움 대상이 아니며 nullable.

ALTER TABLE public.counseling_reports
  ADD COLUMN IF NOT EXISTS mentoring_letter text NULL;

COMMENT ON COLUMN public.counseling_reports.mentoring_letter
  IS '상담/멘토링 레터 추가 메모/첨언 — 자유 서술. 자동 채움 대상 아님.';
