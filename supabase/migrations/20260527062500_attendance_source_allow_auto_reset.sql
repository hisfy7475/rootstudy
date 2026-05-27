-- daily-reset cron (`/api/cron/daily-reset`) 의 강제 퇴실 단계가
-- attendance row 에 source='auto_reset' 으로 insert 하는데, 기존 CHECK 제약
-- (caps|manual) 가 이를 거부하면서 cron 전체가 500 으로 떨어져 step 4
-- (자동 일일 상점 평가) 까지 매일 미실행되던 사고를 해결한다.
ALTER TABLE public.attendance
  DROP CONSTRAINT IF EXISTS attendance_source_check;

ALTER TABLE public.attendance
  ADD CONSTRAINT attendance_source_check
  CHECK (source = ANY (ARRAY['caps'::text, 'manual'::text, 'auto_reset'::text]));
