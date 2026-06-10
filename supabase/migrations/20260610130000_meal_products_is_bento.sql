-- meal_products.is_bento: 도시락 메뉴 여부 플래그.
-- 학생/학부모 주문 화면에서 같은 이용일자(product_start_date) 그룹 내 정렬 시
-- is_bento=true 상품을 먼저(왼쪽) 노출하기 위한 컬럼.
-- 관리자 등록/수정 폼의 "도시락 메뉴" 체크박스로 설정한다.

alter table public.meal_products
  add column if not exists is_bento boolean not null default false;

-- ---------------------------------------------------------------------------
-- create_meal_product_with_variant: p_is_bento 파라미터 추가.
-- 파라미터 추가는 시그니처 변경이라 기존 15-arg 함수와 오버로드가 공존하면
-- PostgREST 가 함수 모호성(PGRST203)으로 실패할 수 있으므로 기존 시그니처를 drop 후 재생성한다.
-- drop 은 기존 GRANT 도 함께 제거하므로 재생성 후 16-arg 시그니처에 권한을 다시 부여한다.
-- 본문은 20260526160000_create_meal_product_with_variant_super_admin.sql 정의를 그대로 옮기되
-- is_bento 컬럼 insert 만 추가했다.
-- ---------------------------------------------------------------------------

drop function if exists public.create_meal_product_with_variant(
  uuid, text, text, text, text, text, text, text, integer,
  date, date, date, date, integer, text
);

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
  p_variant_status text,
  p_is_bento boolean default false
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
    branch_id, name, category, meal_type, description, image_url, status, is_bento
  ) values (
    v_target_branch, p_name, p_category,
    case when p_category = 'exam' then null else p_meal_type end,
    p_description, p_image_url,
    coalesce(p_product_status, 'active'),
    coalesce(p_is_bento, false)
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

-- drop 으로 함께 사라진 권한 재부여 (16-arg 시그니처 기준)
revoke all on function public.create_meal_product_with_variant(
  uuid, text, text, text, text, text, text, text, integer,
  date, date, date, date, integer, text, boolean
) from public;
grant execute on function public.create_meal_product_with_variant(
  uuid, text, text, text, text, text, text, text, integer,
  date, date, date, date, integer, text, boolean
) to authenticated;
