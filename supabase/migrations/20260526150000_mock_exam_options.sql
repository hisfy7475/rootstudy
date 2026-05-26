-- 모의고사 옵션 시스템.
-- 한 모의고사 상품에 옵션 그룹(예: "유형", "영역")과 그룹별 옵션
-- (예: 현장/개별, 과탐/사탐/교차) 을 두고, 학생이 결제 시 그룹별로
-- 하나씩 선택해 meal_orders.option_selections JSONB 스냅샷에 보관한다.
--
-- 운영 정책:
--   - 옵션 가격은 공통 (variant.price 그대로 사용)
--   - 옵션 그룹/옵션 삭제는 status='inactive' (soft delete) 만 허용 → 코드 가드
--   - meal_products.category='exam' 인 상품만 옵션 그룹을 가질 수 있음 (트리거)
--   - paid/pending 주문 스냅샷은 옵션 비활성/이름변경에 영향받지 않음

-- 1. 옵션 그룹 테이블
create table public.mock_exam_option_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.meal_products(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_required boolean not null default true,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, name)
);

create index idx_mock_exam_option_groups_product on public.mock_exam_option_groups(product_id);

-- 2. 옵션 테이블
create table public.mock_exam_options (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.mock_exam_option_groups(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, name)
);

create index idx_mock_exam_options_group on public.mock_exam_options(group_id);

-- 3. meal_orders 에 옵션 선택 스냅샷 컬럼 추가
alter table public.meal_orders
  add column option_selections jsonb;
-- 형식: [{ "group_id": uuid, "group_name": text, "option_id": uuid, "option_name": text }]

-- 4. category='exam' 인 상품에만 옵션 그룹이 붙도록 강제하는 트리거
create or replace function public.enforce_mock_exam_option_group_category()
returns trigger
language plpgsql
as $$
declare
  v_category text;
begin
  select category into v_category
    from public.meal_products
   where id = new.product_id;

  if v_category is null then
    raise exception 'invalid product_id: %', new.product_id;
  end if;

  if v_category <> 'exam' then
    raise exception 'mock_exam_option_groups 는 category=exam 상품에만 사용할 수 있습니다 (received: %)', v_category;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_mock_exam_option_groups_category on public.mock_exam_option_groups;
create trigger trg_mock_exam_option_groups_category
  before insert or update of product_id on public.mock_exam_option_groups
  for each row execute function public.enforce_mock_exam_option_group_category();

-- 5. updated_at 자동 갱신
create or replace function public.touch_mock_exam_option_groups_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_mock_exam_option_groups_touch on public.mock_exam_option_groups;
create trigger trg_mock_exam_option_groups_touch
  before update on public.mock_exam_option_groups
  for each row execute function public.touch_mock_exam_option_groups_updated_at();

create or replace function public.touch_mock_exam_options_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_mock_exam_options_touch on public.mock_exam_options;
create trigger trg_mock_exam_options_touch
  before update on public.mock_exam_options
  for each row execute function public.touch_mock_exam_options_updated_at();

-- 6. RLS (meal_product_variants 와 동일 패턴)
alter table public.mock_exam_option_groups enable row level security;

drop policy if exists "mock_exam_option_groups_select_authenticated" on public.mock_exam_option_groups;
create policy "mock_exam_option_groups_select_authenticated"
  on public.mock_exam_option_groups for select
  to authenticated using (true);

drop policy if exists "mock_exam_option_groups_insert_admin" on public.mock_exam_option_groups;
create policy "mock_exam_option_groups_insert_admin"
  on public.mock_exam_option_groups for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );

drop policy if exists "mock_exam_option_groups_update_admin" on public.mock_exam_option_groups;
create policy "mock_exam_option_groups_update_admin"
  on public.mock_exam_option_groups for update
  to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );

drop policy if exists "mock_exam_option_groups_delete_admin" on public.mock_exam_option_groups;
create policy "mock_exam_option_groups_delete_admin"
  on public.mock_exam_option_groups for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );

alter table public.mock_exam_options enable row level security;

drop policy if exists "mock_exam_options_select_authenticated" on public.mock_exam_options;
create policy "mock_exam_options_select_authenticated"
  on public.mock_exam_options for select
  to authenticated using (true);

drop policy if exists "mock_exam_options_insert_admin" on public.mock_exam_options;
create policy "mock_exam_options_insert_admin"
  on public.mock_exam_options for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );

drop policy if exists "mock_exam_options_update_admin" on public.mock_exam_options;
create policy "mock_exam_options_update_admin"
  on public.mock_exam_options for update
  to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );

drop policy if exists "mock_exam_options_delete_admin" on public.mock_exam_options;
create policy "mock_exam_options_delete_admin"
  on public.mock_exam_options for delete
  to authenticated
  using (
    exists (select 1 from public.profiles p
            where p.id = auth.uid() and p.user_type = 'admin')
  );

-- 7. RPC: 옵션 그룹/옵션 일괄 동기화 (트랜잭션 안전 + admin·branch 검증)
-- 입력 JSONB 형식:
--   [
--     {
--       "id": "uuid?"           -- 기존 그룹이면 id, 신규면 null
--       "name": "유형",
--       "sort_order": 0,
--       "is_required": true,
--       "status": "active",      -- "active" | "inactive"
--       "options": [
--         { "id": "uuid?", "name": "현장", "sort_order": 0, "status": "active" },
--         ...
--       ]
--     },
--     ...
--   ]
-- 동작:
--   - 그룹/옵션 모두 upsert
--   - 입력에 없는 기존 그룹/옵션은 status='inactive' 로 마킹 (soft delete)
--   - 입력이 빈 배열이면 모든 기존 그룹을 inactive 로 마킹
create or replace function public.upsert_mock_exam_option_groups(
  p_product_id uuid,
  p_groups jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $func$
declare
  v_admin_branch uuid;
  v_is_super boolean;
  v_product_branch uuid;
  v_product_category text;
  v_keep_group_ids uuid[] := array[]::uuid[];
  v_group jsonb;
  v_group_id uuid;
  v_option jsonb;
  v_option_id uuid;
  v_keep_option_ids uuid[];
begin
  -- 1) admin 권한 + branch 확인 (슈퍼관리자는 branch 검증 스킵)
  select branch_id, is_super_admin
    into v_admin_branch, v_is_super
    from public.profiles
   where id = auth.uid() and user_type = 'admin';

  if not found then
    raise exception 'permission denied: admin only';
  end if;

  -- 2) 대상 상품 조회
  select branch_id, category
    into v_product_branch, v_product_category
    from public.meal_products
   where id = p_product_id;

  if v_product_branch is null then
    raise exception 'invalid product_id: %', p_product_id;
  end if;

  -- 일반 어드민은 branch 일치 검증, 슈퍼관리자는 스킵
  if not coalesce(v_is_super, false) then
    if v_admin_branch is null then
      raise exception 'permission denied: admin without branch';
    end if;
    if v_product_branch <> v_admin_branch then
      raise exception 'permission denied: branch mismatch';
    end if;
  end if;

  if v_product_category <> 'exam' then
    raise exception 'product is not a mock exam (category=%)', v_product_category;
  end if;

  -- 3) 입력된 그룹 처리 (upsert)
  if p_groups is not null and jsonb_typeof(p_groups) = 'array' then
    for v_group in select * from jsonb_array_elements(p_groups)
    loop
      v_group_id := nullif(v_group->>'id', '')::uuid;

      if v_group_id is null then
        -- 신규 그룹 insert
        insert into public.mock_exam_option_groups (
          product_id, name, sort_order, is_required, status
        ) values (
          p_product_id,
          v_group->>'name',
          coalesce((v_group->>'sort_order')::int, 0),
          coalesce((v_group->>'is_required')::boolean, true),
          coalesce(nullif(v_group->>'status',''), 'active')
        )
        returning id into v_group_id;
      else
        -- 기존 그룹 update (해당 product 소속 확인)
        update public.mock_exam_option_groups
           set name        = v_group->>'name',
               sort_order  = coalesce((v_group->>'sort_order')::int, 0),
               is_required = coalesce((v_group->>'is_required')::boolean, true),
               status      = coalesce(nullif(v_group->>'status',''), 'active')
         where id = v_group_id
           and product_id = p_product_id;
      end if;

      v_keep_group_ids := array_append(v_keep_group_ids, v_group_id);

      -- 4) 그룹 내 옵션 처리
      v_keep_option_ids := array[]::uuid[];
      if v_group ? 'options' and jsonb_typeof(v_group->'options') = 'array' then
        for v_option in select * from jsonb_array_elements(v_group->'options')
        loop
          v_option_id := nullif(v_option->>'id', '')::uuid;

          if v_option_id is null then
            insert into public.mock_exam_options (
              group_id, name, sort_order, status
            ) values (
              v_group_id,
              v_option->>'name',
              coalesce((v_option->>'sort_order')::int, 0),
              coalesce(nullif(v_option->>'status',''), 'active')
            )
            returning id into v_option_id;
          else
            update public.mock_exam_options
               set name       = v_option->>'name',
                   sort_order = coalesce((v_option->>'sort_order')::int, 0),
                   status     = coalesce(nullif(v_option->>'status',''), 'active')
             where id = v_option_id
               and group_id = v_group_id;
          end if;

          v_keep_option_ids := array_append(v_keep_option_ids, v_option_id);
        end loop;
      end if;

      -- 5) 그룹 내 입력에 없던 옵션 soft delete
      update public.mock_exam_options
         set status = 'inactive'
       where group_id = v_group_id
         and not (id = any (v_keep_option_ids))
         and status = 'active';
    end loop;
  end if;

  -- 6) 입력에 없던 그룹 soft delete (해당 그룹의 옵션도 함께)
  update public.mock_exam_options o
     set status = 'inactive'
    from public.mock_exam_option_groups g
   where o.group_id = g.id
     and g.product_id = p_product_id
     and not (g.id = any (v_keep_group_ids))
     and o.status = 'active';

  update public.mock_exam_option_groups
     set status = 'inactive'
   where product_id = p_product_id
     and not (id = any (v_keep_group_ids))
     and status = 'active';
end;
$func$;

revoke all on function public.upsert_mock_exam_option_groups(uuid, jsonb) from public;
grant execute on function public.upsert_mock_exam_option_groups(uuid, jsonb) to authenticated;
