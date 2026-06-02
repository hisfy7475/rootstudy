-- attendance 에 CAPS 게이트 출처를 기록해 추적성을 확보한다.
-- 직원/경비/등록용 단말기 기록을 사후에 식별·정정(소프트 제외)할 수 있게 한다.
-- source='caps' 행만 채워지며, manual/auto_reset 행은 null 로 남는다.
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS gate_id   integer,
  ADD COLUMN IF NOT EXISTS gate_name text;

COMMENT ON COLUMN attendance.gate_id IS 'CAPS tgate.id (source=caps만 채워짐)';
COMMENT ON COLUMN attendance.gate_name IS 'CAPS tgate.name — 순공 제외 판정(입실/퇴실 라벨)에 사용';

-- 배포 직후 PostgREST 가 새 컬럼을 인식하지 못해 insert 가 실패하는 갭 방지
NOTIFY pgrst, 'reload schema';
