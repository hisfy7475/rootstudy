-- 직전 마이그레이션의 update_meal_product_with_variant 가 함수 내부에서
-- "column reference 'product_id' is ambiguous" / 'variant_id' 모호 에러로 실패.
-- 원인: RETURNS TABLE (product_id, variant_id) 의 출력 컬럼명이 함수 본문에서
-- 참조하는 meal_product_variants.product_id, meal_orders.variant_id 와 충돌.
-- 해결: RETURNS TABLE 의 출력 컬럼명을 out_product_id / out_variant_id 로 변경.
-- (호출자 TS 도 동일하게 새 키로 매핑됨.)
-- 반환 타입이 바뀌므로 DROP 후 재생성 필요 (CREATE OR REPLACE 만으로는 불가).

drop function if exists public.update_meal_product_with_variant(
  uuid, uuid, text, text, text, text, text, integer, date, date, date, date, integer, text
);

create or replace function public.update_meal_product_with_variant(
  p_product_id uuid,
  p_variant_id uuid,
  p_name text,
  p_description text,
  p_status text,
  p_meal_type text,
  p_variant_kind text,
  p_variant_price integer,
  p_variant_sale_start date,
  p_variant_sale_end date,
  p_variant_product_start date,
  p_variant_product_end date,
  p_variant_max_capacity integer,
  p_variant_status text
)
returns table (out_product_id uuid, out_variant_id uuid)
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_admin_branch uuid;
  v_product_branch uuid;
  v_category text;
  v_existing_kind text;
  v_existing_price integer;
  v_existing_product_start date;
  v_existing_product_end date;
  v_existing_max_capacity integer;
  v_existing_product_id uuid;
  v_paid_count integer;
  v_kind text;
  v_meal_type text;
  v_critical_changed boolean;
begin
  select branch_id into v_admin_branch
  from public.profiles
  where id = auth.uid() and user_type = 'admin';

  if v_admin_branch is null then
    raise exception 'permission denied: admin only';
  end if;

  select branch_id, category into v_product_branch, v_category
  from public.meal_products
  where id = p_product_id;

  if v_product_branch is null then
    raise exception '상품을 찾을 수 없습니다.';
  end if;

  if v_product_branch <> v_admin_branch then
    raise exception 'permission denied: branch mismatch';
  end if;

  select kind, price, product_start_date, product_end_date, max_capacity, product_id
    into v_existing_kind, v_existing_price, v_existing_product_start,
         v_existing_product_end, v_existing_max_capacity, v_existing_product_id
  from public.meal_product_variants
  where id = p_variant_id;

  if v_existing_product_id is null then
    raise exception '옵션을 찾을 수 없습니다.';
  end if;

  if v_existing_product_id <> p_product_id then
    raise exception '옵션이 해당 상품에 속하지 않습니다.';
  end if;

  v_kind := case when v_category = 'exam' then 'one_time' else p_variant_kind end;
  v_meal_type := case when v_category = 'exam' then null else p_meal_type end;

  select count(*) into v_paid_count
  from public.meal_orders
  where variant_id = p_variant_id and status = 'paid';

  v_critical_changed := (
    v_kind                  is distinct from v_existing_kind
    or p_variant_price      is distinct from v_existing_price
    or p_variant_product_start is distinct from v_existing_product_start
    or p_variant_product_end   is distinct from v_existing_product_end
    or p_variant_max_capacity  is distinct from v_existing_max_capacity
  );

  if v_paid_count > 0 and v_critical_changed then
    raise exception '결제 완료된 주문이 있어 가격·시험 기간·정원·종류는 수정할 수 없습니다. (신청 기간은 수정 가능)';
  end if;

  update public.meal_products
     set name = p_name,
         description = p_description,
         status = coalesce(p_status, status),
         meal_type = v_meal_type,
         updated_at = now()
   where id = p_product_id;

  update public.meal_product_variants
     set kind = v_kind,
         price = p_variant_price,
         sale_start_date = p_variant_sale_start,
         sale_end_date = p_variant_sale_end,
         product_start_date = p_variant_product_start,
         product_end_date = p_variant_product_end,
         max_capacity = p_variant_max_capacity,
         status = coalesce(p_variant_status, status),
         updated_at = now()
   where id = p_variant_id;

  return query select p_product_id, p_variant_id;
end;
$func$;

revoke all on function public.update_meal_product_with_variant(
  uuid, uuid, text, text, text, text, text, integer, date, date, date, date, integer, text
) from public;
grant execute on function public.update_meal_product_with_variant(
  uuid, uuid, text, text, text, text, text, integer, date, date, date, date, integer, text
) to authenticated;
