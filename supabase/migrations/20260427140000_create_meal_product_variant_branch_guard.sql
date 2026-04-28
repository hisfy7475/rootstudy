-- create_meal_product_with_variant 보안 보강.
-- 기존 본문은 user_type='admin' 만 검사하고 caller 가 보낸 p_branch_id 를
-- 그대로 INSERT 해, 한 지점 admin 이 다른 지점에 상품을 꽂아 넣을 수 있었다
-- (SECURITY DEFINER + GRANT EXECUTE TO authenticated 라 RLS 우회).
-- update_meal_product_with_variant 의 패턴(auth.uid() → 본인 branch 추출 후
-- 일치 검증)을 동일하게 적용한다.
--
-- 시그니처(인자 타입 목록 + RETURNS TABLE 컬럼명)는 변경하지 않으므로
-- CREATE OR REPLACE 만으로 충분하고 기존 GRANT/REVOKE 도 그대로 보존된다.

create or replace function public.create_meal_product_with_variant(
  p_branch_id uuid,
  p_name text,
  p_category text,
  p_meal_type text,
  p_description text,
  p_image_url text,
  p_product_status text,
  p_variant_kind text,
  p_variant_price integer,
  p_variant_sale_start date,
  p_variant_sale_end date,
  p_variant_product_start date,
  p_variant_product_end date,
  p_variant_max_capacity integer,
  p_variant_status text
)
returns table (product_id uuid, variant_id uuid)
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_admin_branch uuid;
  v_product_id uuid;
  v_variant_id uuid;
  v_kind text;
begin
  -- 1) 호출자가 admin 인지 + 본인의 branch 추출 (호출자가 보낸 p_branch_id 는 신뢰하지 않음)
  select branch_id into v_admin_branch
    from public.profiles
   where id = auth.uid() and user_type = 'admin';

  if v_admin_branch is null then
    raise exception 'permission denied: admin only';
  end if;

  -- 2) 호출자가 보낸 branch 와 일치하는지 검증
  if p_branch_id <> v_admin_branch then
    raise exception 'permission denied: branch mismatch';
  end if;

  -- 3) 모의고사 카테고리는 항상 one_time
  v_kind := case when p_category = 'exam' then 'one_time' else p_variant_kind end;

  insert into public.meal_products (
    branch_id, name, category, meal_type, description, image_url, status
  ) values (
    p_branch_id, p_name, p_category,
    case when p_category = 'exam' then null else p_meal_type end,
    p_description, p_image_url,
    coalesce(p_product_status, 'active')
  )
  returning id into v_product_id;

  insert into public.meal_product_variants (
    product_id, kind, price, sale_start_date, sale_end_date,
    product_start_date, product_end_date, max_capacity, status
  ) values (
    v_product_id, v_kind, p_variant_price, p_variant_sale_start, p_variant_sale_end,
    p_variant_product_start, p_variant_product_end, p_variant_max_capacity,
    coalesce(p_variant_status, 'active')
  )
  returning id into v_variant_id;

  return query select v_product_id, v_variant_id;
end;
$func$;
