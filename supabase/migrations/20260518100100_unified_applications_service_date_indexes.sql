-- 통합 신청내역 검색이 service_start_date 기반으로 전환됨에 따라
-- underlying 테이블에 정렬·범위 스캔용 단일 인덱스 추가.
--
-- mentoring 분기는 ms.date 가 base 컬럼이라 push-down 가능.
-- meal/exam 분기는 mpv.product_start_date 가 JOIN 이후 필터라 planner
-- 선택에 따라 인덱스가 활용되지 않을 수 있으나, 추가 자체는 무해.

CREATE INDEX IF NOT EXISTS idx_mentoring_slots_date
  ON public.mentoring_slots (date);

CREATE INDEX IF NOT EXISTS idx_meal_product_variants_product_start_date
  ON public.meal_product_variants (product_start_date);
