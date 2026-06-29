-- 영단어 시험 상점 부여 정책 변경: "주 1회(첫 정상 제출)" → "월~금 5일 개근 시 주 1회".
-- DDL 변경 없음 — 멱등 인덱스 uq_points_vocab_daily 의 의미만 갱신(코멘트).
-- 실제 개근 판정/보류 로직은 애플리케이션(awardVocabReward, src/lib/actions/vocab.ts)에 있다.
-- study_date 에 그 주 월요일 학습일을 박제해 학습주당 1건만 허용하는 멱등은 그대로 유지.

comment on index public.uq_points_vocab_daily is
  '영단어 보상(event_kind=auto_vocab): 그 학습주 월~금 5일을 모두 정상 제출(개근)한 경우에만 2점, 학습주당 1건. study_date 에 그 주 월요일 학습일을 박제해 멱등 보장(재시도·동시 마감·개근 후 추가 응시 중복 차단). 하루라도 빠지면(미응시·자동마감) 그 주 미부여.';
