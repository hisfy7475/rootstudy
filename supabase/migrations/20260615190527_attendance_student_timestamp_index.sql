-- attendance(student_id, timestamp) 복합 인덱스 추가
--
-- 배경: /admin·/student·/parent 의 출결 기반 페이지가
--   SELECT ... FROM attendance WHERE student_id = ANY($1) AND timestamp >= $2 AND timestamp < $3 ORDER BY timestamp
-- 형태로 조회하는데, student_id·timestamp 단일 인덱스만 있어 학생 수만큼 timestamp 인덱스를
-- 반복 재스캔(BitmapAnd)하면서 prod 기준 13초까지 소요 → 서버리스 함수/statement timeout(504) 유발.
-- 복합 인덱스로 학생별 timestamp 범위 스캔이 가능해져 prod 실측 13.3s → 1.05s 로 단축됨.
--
-- 적용 이력: 운영/dev DB 에는 무중단(CREATE INDEX CONCURRENTLY)으로 이미 직접 적용 완료.
-- 이 파일은 신규/재구축 환경용 기록이며, 마이그레이션 러너가 트랜잭션으로 감싸도 실패하지
-- 않도록 비-CONCURRENTLY + IF NOT EXISTS(멱등) 로 둔다. 빈 DB 에서는 짧은 락이 무해하고,
-- 이미 인덱스가 있으면 no-op 이다. 라이브 DB 에 수동 적용할 때는 반드시 CONCURRENTLY 사용.
CREATE INDEX IF NOT EXISTS idx_attendance_student_timestamp
  ON public.attendance (student_id, "timestamp");
