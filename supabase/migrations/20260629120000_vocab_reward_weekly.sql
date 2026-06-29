-- 영단어 시험 상점(event_kind='auto_vocab') 부여 정책 변경: "학습일당 1회" → "학습주당 1회".
--
-- 정책: 학생은 매일 응시하되, 상점은 그 주에 처음 정상 제출(submit_type='normal')한 1회만 2점.
-- 구현: 부여 시 points.study_date 에 응시일(exam_date) 대신 "그 주 월요일 학습일"을 박제한다
--   (서버 액션 awardVocabReward → weekMondayStr). 같은 학습주의 모든 정상 제출이 같은 study_date 로
--   수렴하므로, 기존 uq_points_vocab_daily(student_id, study_date) WHERE event_kind='auto_vocab'
--   부분 unique 인덱스가 그대로 "학습주당 1건" 멱등으로 동작한다.
--
-- 따라서 인덱스 컬럼 구성(student_id, study_date)은 변경하지 않는다 — DDL 변경 없이 코멘트만 정정한다.
-- (선행 마이그레이션 20260624120000_vocab_reward_dedup.sql 의 "학습일당 1회 / study_date := exam_date"
--  전제 주석은 이 마이그레이션으로 대체된다.)
-- 인덱스 이름은 _daily 로 남지만 재생성 비용/리스크를 피해 이름은 유지하고, 의미는 코멘트로 명시한다.

comment on index public.uq_points_vocab_daily is
  '영단어 보상(event_kind=auto_vocab): study_date 에 그 주 월요일 학습일을 박제 → 학생당 학습주 1건만 허용(주 1회). 매일 응시는 가능하나 상점은 첫 정상 제출 1회. 재시도·동시 마감·같은 주 재응시 중복 차단.';
