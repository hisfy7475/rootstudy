-- 정기(recurring) variant 의 식사 기간 요일 제약 완화.
-- 종전: product_start_date=월요일, product_end_date=금요일 강제.
-- 변경: 같은 주 월~금 안의 연속 기간이면 허용 (공휴일 주 3·4일분, 내신기간 운영 대응).
--   - 시작·종료 모두 월~금
--   - 종료 요일 >= 시작 요일 이고 일수 차이가 요일 차이와 같음 (= 같은 주)
-- NOT VALID: 종전 제약은 여러 주에 걸친 월~금 기간도 통과시켰다. dev 에 그런 테스트 행
--   (5월 석식 05-04~05-29)이 남아 있어 기존 행 검증은 건너뛰고 신규·수정 행에만 적용한다.
--   (prod 는 적용 시점에 위반 행 0건)

alter table public.meal_product_variants
  drop constraint if exists meal_variant_recurring_weekday_chk;

alter table public.meal_product_variants
  add constraint meal_variant_recurring_weekday_chk
    check (
      kind <> 'recurring' or (
        extract(isodow from product_start_date) between 1 and 5
        and extract(isodow from product_end_date) between 1 and 5
        and (product_end_date - product_start_date)
          = extract(isodow from product_end_date) - extract(isodow from product_start_date)
      )
    ) not valid;
