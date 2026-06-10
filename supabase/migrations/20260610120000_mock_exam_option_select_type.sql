-- 모의고사 옵션 그룹에 select_type(단일/복수 선택) 추가.
--   'single'   = 그룹에서 옵션 1개만 선택 (지금까지의 동작)
--   'multiple' = 그룹에서 옵션 여러 개 선택 가능
-- 기존 그룹은 모두 단일 선택이었으므로 default 'single' 로 백필된다.

alter table public.mock_exam_option_groups
  add column select_type text not null default 'single'
    check (select_type in ('single','multiple'));

-- RPC 재정의: 그룹 upsert 시 select_type 도 함께 저장.
-- 시그니처 동일 → create or replace 로 덮어쓰기.
-- (베이스: 20260526150200_upsert_mock_exam_option_groups_super_admin_fix.sql)
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
  select branch_id, is_super_admin
    into v_admin_branch, v_is_super
    from public.profiles
   where id = auth.uid() and user_type = 'admin';

  if not found then
    raise exception 'permission denied: admin only';
  end if;

  select branch_id, category
    into v_product_branch, v_product_category
    from public.meal_products
   where id = p_product_id;

  if v_product_branch is null then
    raise exception 'invalid product_id: %', p_product_id;
  end if;

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

  if p_groups is not null and jsonb_typeof(p_groups) = 'array' then
    for v_group in select * from jsonb_array_elements(p_groups)
    loop
      v_group_id := nullif(v_group->>'id', '')::uuid;

      if v_group_id is null then
        insert into public.mock_exam_option_groups (
          product_id, name, sort_order, is_required, select_type, status
        ) values (
          p_product_id,
          v_group->>'name',
          coalesce((v_group->>'sort_order')::int, 0),
          coalesce((v_group->>'is_required')::boolean, true),
          coalesce(nullif(v_group->>'select_type',''), 'single'),
          coalesce(nullif(v_group->>'status',''), 'active')
        )
        returning id into v_group_id;
      else
        update public.mock_exam_option_groups
           set name        = v_group->>'name',
               sort_order  = coalesce((v_group->>'sort_order')::int, 0),
               is_required = coalesce((v_group->>'is_required')::boolean, true),
               select_type = coalesce(nullif(v_group->>'select_type',''), 'single'),
               status      = coalesce(nullif(v_group->>'status',''), 'active')
         where id = v_group_id
           and product_id = p_product_id;
      end if;

      v_keep_group_ids := array_append(v_keep_group_ids, v_group_id);

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

      update public.mock_exam_options
         set status = 'inactive'
       where group_id = v_group_id
         and not (id = any (v_keep_option_ids))
         and status = 'active';
    end loop;
  end if;

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
