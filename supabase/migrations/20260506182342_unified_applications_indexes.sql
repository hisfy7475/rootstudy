-- 통합 신청내역 페이지의 정렬 1차 키 인덱스.
-- unified_applications VIEW 가 underlying 테이블을 UNION ALL 로 합치므로
-- 외부 ORDER BY applied_at DESC 가 push down 되려면 underlying 측 인덱스가 필요하다.
--
-- meal_orders.created_at / mentoring_applications.applied_at 단일 정렬 인덱스만 추가.
-- 상태·variant 복합 인덱스는 운영 EXPLAIN 보고 결정 (premature optimization 방지).

CREATE INDEX IF NOT EXISTS idx_meal_orders_created_at
  ON public.meal_orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mentoring_applications_applied_at
  ON public.mentoring_applications (applied_at DESC);
