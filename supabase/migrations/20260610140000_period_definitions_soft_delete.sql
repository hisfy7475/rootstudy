-- 교시 소프트 삭제: 몰입도 기록(focus_scores)이 참조하는 교시를 물리 삭제하면
-- FK(ON DELETE NO ACTION) 위반으로 삭제가 막힌다. 참조가 있는 교시는 물리 삭제 대신
-- archived_at 으로 "은퇴(보관)" 처리해, 관리 목록·오늘 입력에서는 숨기되 과거 기록은 보존한다.

-- archived_at 컬럼 추가 (NULL = 활성 교시)
ALTER TABLE public.period_definitions
  ADD COLUMN IF NOT EXISTS archived_at timestamptz NULL;

-- 기존 전체 UNIQUE 제약 제거 → 활성 교시끼리만 적용하는 부분 유니크 인덱스로 교체.
-- (은퇴한 교시가 같은 period_number 를 점유하지 않게 해, 같은 번호의 새 교시 생성을 허용)
ALTER TABLE public.period_definitions
  DROP CONSTRAINT IF EXISTS period_definitions_branch_id_date_type_id_period_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_period_definitions_active
  ON public.period_definitions (branch_id, date_type_id, period_number)
  WHERE archived_at IS NULL;

-- 활성 교시 조회 가속용 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_period_definitions_active
  ON public.period_definitions (branch_id, date_type_id)
  WHERE archived_at IS NULL;
