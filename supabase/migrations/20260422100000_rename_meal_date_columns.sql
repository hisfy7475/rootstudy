-- meal_products.meal_start_date / meal_end_date는 meal에선 "식사 기간",
-- exam(모의고사)에선 "시험 기간"을 의미해 한 컬럼이 두 의미를 가진다.
-- 도메인 혼동을 제거하기 위해 카테고리 중립 이름으로 rename.
alter table public.meal_products
  rename column meal_start_date to product_start_date;
alter table public.meal_products
  rename column meal_end_date to product_end_date;
