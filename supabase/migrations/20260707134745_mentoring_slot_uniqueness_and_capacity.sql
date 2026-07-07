-- 멘토링 슬롯 더블부킹 구조적 방지.
--
-- 배경:
--   프로덕션에서 같은 멘토·날짜·시각에 활성 슬롯이 2개 생성되어(교차 대리 등록 시
--   정원 찬 슬롯 대신 같은 시각에 슬롯을 하나 더 만든 우회), 물리적 멘토가 같은
--   시간에 두 번 잡히는 더블부킹이 발생했다. 또한 신청 경로가 모두
--   read booked_count -> check -> insert 비원자 패턴이라 정원 초과 레이스 창이 있다.
--
-- 이 마이그레이션은 두 불변식을 DB 계층에서 강제한다:
--   ① 한 멘토는 같은 (mentor_id, date, start_time) 활성 슬롯을 하나만 갖는다.
--   ② 모든 슬롯에서 booked_count <= capacity (정원 초과 불가).
--
-- 주의: 기존 활성 중복 슬롯 / booked_count>capacity 행이 남아 있으면 아래 문이 실패한다.
--   반드시 사전 데이터 정리 후 적용할 것(안전장치로 의도된 실패).

-- ① 같은 멘토·날짜·시각 활성 슬롯 중복 방지.
--    소프트삭제(is_active=false)된 슬롯은 제외해야 삭제 후 같은 시간 재생성이
--    가능하므로 partial unique index 로 건다.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mentoring_slots_mentor_time
  ON public.mentoring_slots (mentor_id, date, start_time)
  WHERE is_active;

-- ② 정원 초과 불변식.
--    booked_count 는 mentoring_application_sync_booked_count 트리거의
--    `booked_count = booked_count + 1` UPDATE 로만 증가하는데, 이 UPDATE 는
--    슬롯 행 잠금으로 직렬화된다. READ COMMITTED 에서 동시 신청 2건이 정원 1
--    슬롯에 올 때, 두 번째 트랜잭션은 첫 번째 커밋 후 최신 booked_count(1)을
--    재평가해 2를 계산 → 이 CHECK 위반(23514)으로 원본 INSERT/UPDATE 가 통째로
--    롤백된다. 즉 이 CHECK 가 오버부킹 레이스의 패자를 원자적으로 막는다.
ALTER TABLE public.mentoring_slots
  ADD CONSTRAINT chk_mentoring_slots_booked_le_capacity
  CHECK (booked_count <= capacity);
