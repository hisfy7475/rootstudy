-- 영단어 시험 미응시 리마인더 발송 로그 (멱등 키).
--
-- 배경: 클라이언트 요청으로 평일 20:00(KST)에 "오늘 영단어 시험 미응시" 리마인더 푸시를 보낸다.
--       크론 재시도·수동 호출·동시 실행에서 같은 학생에게 두 번 가지 않도록,
--       (student_id, study_date) PK 에 claim-first INSERT 로 선점한 학생에게만 발송한다.
--       daily_focus_evaluations.notified_at 과 같은 역할이며, 영단어에는 담을 기존 테이블이
--       없어(vocab_exams 는 "응시한 학생"만 있고 리마인더 대상은 "응시 안 한 학생") 별도로 둔다.

CREATE TABLE IF NOT EXISTS public.vocab_exam_reminders (
  student_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  study_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, study_date)
);

COMMENT ON TABLE public.vocab_exam_reminders IS
  '영단어 미응시 리마인더 발송 기록. 학습일 기준 학생당 1건(PK)으로 중복 발송을 DB 레벨에서 차단한다. vocab-exam-reminder 크론 전용.';

-- 서비스 롤(크론) 전용. 클라이언트가 읽을 일이 없으므로 정책을 두지 않는다(RLS 활성 + 정책 0 = 전면 차단).
ALTER TABLE public.vocab_exam_reminders ENABLE ROW LEVEL SECURITY;
