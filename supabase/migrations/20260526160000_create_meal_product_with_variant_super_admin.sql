-- create_meal_product_with_variant: 슈퍼관리자(is_super_admin=true)가 임의 branch 에
-- 상품을 등록할 수 있도록 가드 완화. update_meal_product_with_variant 와 동일 패턴.
--
-- 변경 전: branch_id NULL 인 슈퍼관리자는 'permission denied: admin only' 로 막혔다.
-- 변경 후: 슈퍼관리자는 caller 가 보낸 p_branch_id 를 신뢰하되, 실제 존재하는
--          branch 인지만 검증. 일반 admin 은 본인 branch 와 일치해야 함(기존 동작).

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
  v_is_super boolean;
  v_product_id uuid;
  v_variant_id uuid;
  v_kind text;
  v_target_branch uuid;
begin
  select branch_id, is_super_admin
    into v_admin_branch, v_is_super
    from public.profiles
   where id = auth.uid() and user_type = 'admin';

  if not found then
    raise exception 'permission denied: admin only';
  end if;

  if coalesce(v_is_super, false) then
    if p_branch_id is null then
      raise exception 'branch_id required for super admin';
    end if;
    if not exists (select 1 from public.branches where id = p_branch_id) then
      raise exception 'invalid branch_id: %', p_branch_id;
    end if;
    v_target_branch := p_branch_id;
  else
    if v_admin_branch is null then
      raise exception 'permission denied: admin without branch';
    end if;
    if p_branch_id <> v_admin_branch then
      raise exception 'permission denied: branch mismatch';
    end if;
    v_target_branch := v_admin_branch;
  end if;

  v_kind := case when p_category = 'exam' then 'one_time' else p_variant_kind end;

  insert into public.meal_products (
    branch_id, name, category, meal_type, description, image_url, status
  ) values (
    v_target_branch, p_name, p_category,
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
