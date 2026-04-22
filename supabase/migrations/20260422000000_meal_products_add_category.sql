-- meal_products에 모의고사(mock-exam)도 함께 담을 수 있도록 category 컬럼 추가
-- 모의고사는 일별 메뉴 개념이 없으므로 meal_type을 NULL 허용으로 완화

alter table public.meal_products
  add column if not exists category text not null default 'meal';

alter table public.meal_products
  drop constraint if exists meal_products_category_check;
alter table public.meal_products
  add constraint meal_products_category_check
  check (category in ('meal', 'exam'));

alter table public.meal_products
  alter column meal_type drop not null;

-- meal_type은 category='meal'일 때만 lunch/dinner 강제, 'exam'일 때는 NULL 허용
alter table public.meal_products
  drop constraint if exists meal_products_meal_type_check;
alter table public.meal_products
  add constraint meal_products_meal_type_check
  check (
    (category = 'exam')
    or (category = 'meal' and meal_type in ('lunch', 'dinner'))
  );

create index if not exists idx_meal_products_category
  on public.meal_products(category);
