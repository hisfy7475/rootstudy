-- uq_points_study_date_preset 에서 auto_mentoring 제외
--
-- 기존 인덱스는 (student_id, preset_id, study_date) 라 "학생·학습일·프리셋당 1건",
-- 즉 사실상 1일 1점을 DB 레벨에서 강제한다.
--
-- 멘토링·상담 참여 상점은 **세션당 1점**이 정책이다(확정 신청 1건 = 1점).
-- 프로덕션 실사례에서도 하루에 2건 참여한 학생 2명 모두 2점을 받았다.
-- 같은 학습일에 멘토링+상담을 모두 참여하면 2행이 필요하므로 이 인덱스에 걸린다.
--
-- auto_mentoring 의 멱등은 mentoring_reward_grants (application_id PK) 원장이
-- 단독으로 책임지므로, 이 인덱스의 보호가 필요 없다.
-- 다른 event_kind(manual / auto_late / auto_early / auto_daily_focus …)의 동작은 그대로다.
--
-- IS DISTINCT FROM 을 쓰는 이유: event_kind 는 NOT NULL 이지만,
-- `<>` 는 NULL 입력 시 NULL(=제외)이 되어 의도치 않게 인덱스 범위를 넓힌다.

DROP INDEX IF EXISTS public.uq_points_study_date_preset;

CREATE UNIQUE INDEX uq_points_study_date_preset
  ON public.points (student_id, preset_id, study_date)
  WHERE preset_id IS NOT NULL AND event_kind IS DISTINCT FROM 'auto_mentoring';

COMMENT ON INDEX public.uq_points_study_date_preset IS
  '같은 학생·같은 학습일(study_date)·같은 프리셋 중복 부여 차단. auto_mentoring 은 세션당 1점 정책이라 제외되며, 멱등은 mentoring_reward_grants 원장이 담당한다.';
