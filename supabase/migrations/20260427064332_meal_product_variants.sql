-- meal_products(메뉴 메타) + meal_product_variants(결제 옵션) 분리.
-- 한 메뉴에 일일/정기 같은 여러 결제 옵션을 둘 수 있도록 모델 변경.
-- 기존 모든 product 는 kind='one_time' variant 1개로 backfill.
-- 모의고사(category='exam') 도 동일하게 one_time 1개 자동 부여 (RPC).
-- 정기(recurring) variant 는 product_start_date=월요일, product_end_date=금요일 강제.

-- 1. meal_product_variants 테이블 + 제약 + 인덱스
create table public.meal_product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.meal_products(id) on delete cascade,
  kind text not null check (kind in ('one_time','recurring')),
  price integer not null check (price >= 0),
  sale_start_date date not null,
  sale_end_date date not null,
  product_start_date date not null,
  product_end_date date not null,
  max_capacity integer null check (max_capacity is null or max_capacity > 0),
  status text not null default 'active' check (status in ('active','inactive','sold_out')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint meal_variant_period_chk
    check (sale_start_date <= sale_end_date and product_start_date <= product_end_date),
  constraint meal_variant_recurring_weekday_chk
    check (
      kind <> 'recurring' or (
        extract(isodow from product_start_date) = 1
        and extract(isodow from product_end_date) = 5
      )
    )
);

create index idx_meal_product_variants_product on public.meal_product_variants(product_id);
create index idx_meal_product_variants_status on public.meal_product_variants(status);

-- 2. RLS (meal_products와 동일 패턴)
alter table public.meal_product_variants enable row level security;

drop policy if exists "meal_product_variants_select_authenticated" on public.meal_product_variants;
create policy "meal_product_variants_select_authenticated"
  on public.meal_product_variants for select
  to authenticated using (true);

drop policy if exists "meal_product_variants_insert_admin" on public.meal_product_variants;
create policy "meal_product_variants_insert_admin"
  on public.meal_product_variants for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );

drop policy if exists "meal_product_variants_update_admin" on public.meal_product_variants;
create policy "meal_product_variants_update_admin"
  on public.meal_product_variants for update
  to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );

drop policy if exists "meal_product_variants_delete_admin" on public.meal_product_variants;
create policy "meal_product_variants_delete_admin"
  on public.meal_product_variants for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );

-- 3. 기존 product → variant 1:1 backfill (모두 one_time)
insert into public.meal_product_variants (
  product_id, kind, price, sale_start_date, sale_end_date,
  product_start_date, product_end_date, max_capacity, status
)
select id, 'one_time', price, sale_start_date, sale_end_date,
       product_start_date, product_end_date, max_capacity, status
from public.meal_products;

-- 4. meal_orders.variant_id 컬럼 추가 (nullable 임시)
alter table public.meal_orders add column variant_id uuid;

-- 5. order.product_id 기준으로 variant_id 매핑
update public.meal_orders o
   set variant_id = v.id
  from public.meal_product_variants v
 where v.product_id = o.product_id;

-- 6. backfill 검증 (실패 시 트랜잭션 강제 롤백)
do $$
declare missing int;
begin
  select count(*) into missing from public.meal_orders where variant_id is null;
  if missing > 0 then
    raise exception 'meal_orders.variant_id backfill 실패: % 건', missing;
  end if;
end$$;

-- 7. NOT NULL + FK + 인덱스
alter table public.meal_orders
  alter column variant_id set not null;
alter table public.meal_orders
  add constraint meal_orders_variant_fk
    foreign key (variant_id) references public.meal_product_variants(id)
    on delete restrict;
create index idx_meal_orders_variant on public.meal_orders(variant_id);

-- 8. 기존 product_id 인덱스 + 컬럼 제거
drop index if exists public.idx_meal_orders_product;
alter table public.meal_orders drop column product_id;

-- 9. meal_products 에서 이전된 6개 컬럼 제거
alter table public.meal_products
  drop column price,
  drop column sale_start_date,
  drop column sale_end_date,
  drop column product_start_date,
  drop column product_end_date,
  drop column max_capacity;

-- 10. RPC: product + 첫 variant 동시 생성 (단일 트랜잭션 + admin 권한 강제)
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
  v_product_id uuid;
  v_variant_id uuid;
  v_kind text;
  v_is_admin boolean;
begin
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and user_type = 'admin'
  ) into v_is_admin;

  if not coalesce(v_is_admin, false) then
    raise exception 'permission denied: admin only';
  end if;

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

revoke all on function public.create_meal_product_with_variant(
  uuid, text, text, text, text, text, text, text, integer, date, date, date, date, integer, text
) from public;
grant execute on function public.create_meal_product_with_variant(
  uuid, text, text, text, text, text, text, text, integer, date, date, date, date, integer, text
) to authenticated;
