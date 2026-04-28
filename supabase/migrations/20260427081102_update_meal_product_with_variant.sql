-- product(meta) + variant 동시 update 를 단일 트랜잭션으로 처리하는 RPC.
-- 어드민 detail 폼에서 두 번의 서버 호출이 부분 저장을 일으키던 문제 해결.
-- 결제(paid) 가드는 RPC 안에서 IS DISTINCT FROM 으로 NULL-safe 비교.
--   - 가격·시험 기간(product_*)·정원·종류(kind) 가 실제로 변경되면 차단.
--   - 신청 기간(sale_*) 은 결제 후에도 자유롭게 수정 가능 (정책).
-- 호출자가 보낸 branch_id 는 신뢰하지 않고 admin 본인의 branch 를 강제.

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
returns table (product_id uuid, variant_id uuid)
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
  -- 1) 호출자가 admin 인지 + 본인의 branch 추출
  select branch_id into v_admin_branch
  from public.profiles
  where id = auth.uid() and user_type = 'admin';

  if v_admin_branch is null then
    raise exception 'permission denied: admin only';
  end if;

  -- 2) 대상 product 의 branch / category 확인 (호출자 branch 와 일치 강제)
  select branch_id, category into v_product_branch, v_category
  from public.meal_products
  where id = p_product_id;

  if v_product_branch is null then
    raise exception '상품을 찾을 수 없습니다.';
  end if;

  if v_product_branch <> v_admin_branch then
    raise exception 'permission denied: branch mismatch';
  end if;

  -- 3) variant 현재값 조회 (가드용 비교 + product_id 일치 검증)
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

  -- 4) exam 카테고리 보정 (kind=one_time, meal_type=NULL 강제)
  v_kind := case when v_category = 'exam' then 'one_time' else p_variant_kind end;
  v_meal_type := case when v_category = 'exam' then null else p_meal_type end;

  -- 5) 결제 가드 — IS DISTINCT FROM 으로 NULL-safe 비교 (max_capacity nullable)
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

  -- 6) product 메타 update
  update public.meal_products
     set name = p_name,
         description = p_description,
         status = coalesce(p_status, status),
         meal_type = v_meal_type,
         updated_at = now()
   where id = p_product_id;

  -- 7) variant update — DB CHECK 제약이 기간/요일 무결성 자동 검증
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
