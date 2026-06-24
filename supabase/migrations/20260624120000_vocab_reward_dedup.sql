-- 영단어 시험 정상 완료 시 상점 2점 자동부여(event_kind='auto_vocab')의 멱등성 보장.
--
-- 부여는 서버 액션(finalizeExam)에서 service-role 로 points 에 INSERT 한다.
-- vocab 보상은 preset_id 가 없어 기존 uq_points_study_date_preset(preset_id IS NOT NULL)
-- 부분 unique 인덱스의 보호를 받지 못한다. 재시도/동시 마감 시 중복 INSERT 를 막기 위해
-- (student_id, study_date) 단위 부분 unique 인덱스를 별도로 둔다.
--   - 시험은 학습일당 1회(vocab_exams UNIQUE(student_id, exam_date))이므로 study_date 단위 dedup 으로 충분.
--   - INSERT 시 study_date := vocab_exams.exam_date 로 채운다(채워야 dedup 가능 — NULL 은 unique 에서 서로 distinct).
--   - 중복 INSERT 는 23505 로 거부되며 액션에서 무음 흡수한다.
--
-- event_kind 'auto_vocab' 는 양수(amount>0)라 기존 points_event_kind_amount_sign CHECK 를 그대로 통과한다(별도 제약 변경 불필요).

create unique index if not exists uq_points_vocab_daily
  on public.points (student_id, study_date)
  where event_kind = 'auto_vocab';

comment on index public.uq_points_vocab_daily is
  '영단어 보상(event_kind=auto_vocab): 같은 학생/같은 학습일(study_date)에 1건만 허용. 재시도·동시 마감 중복 차단.';
