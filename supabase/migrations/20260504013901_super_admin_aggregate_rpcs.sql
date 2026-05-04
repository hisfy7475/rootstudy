-- 슈퍼관리자 도입에 따른 branch-guard RPC 일괄 보강.
-- 기존 8개 RPC 가 호출자의 profile.branch_id 와 p_branch_id 가 일치해야 통과시켰는데,
-- 슈퍼관리자도 마찬가지로 막혀 전 지점 운영이 불가능했다.
-- 본 마이그레이션은 시그니처/grant/return shape 을 모두 그대로 두고 본문만 갱신해
-- "is_super_admin = true 이면 어떤 p_branch_id 든 통과 (NULL 포함)" 분기를 추가한다.
--
-- 영향 RPC:
--   1) count_attendance_status        — read aggregate
--   2) points_summary                  — read aggregate
--   3) focus_weekly_summary            — read aggregate
--   4) admin_search_absence_schedules  — read with search
--   5) get_admin_unread_chat_count     — read aggregate (auth.uid() 기반)
--   6) get_chat_room_list              — read with optional admin filter
--   7) create_meal_product_with_variant — write (branch 지정 필요)
--   8) update_meal_product_with_variant — write (대상 row branch 검증)
--
-- 일반 어드민 동작은 변경 없음. 슈퍼만 NULL/타지점 통과.

-- =============================================
-- 1) count_attendance_status
-- =============================================
create or replace function public.count_attendance_status(
  p_branch_id uuid,
  p_target_date date default current_date
)
returns table (
  checked_in int,
  checked_out int,
  on_break int,
  not_yet_arrived int,
  total int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_admin_branch uuid;
  v_is_super boolean;
begin
  select branch_id, is_super_admin
    into v_admin_branch, v_is_super
    from public.profiles
   where id = auth.uid() and user_type = 'admin';
  if not found then
    raise exception 'permission denied: admin only';
  end if;
  if not v_is_super then
    if v_admin_branch is null then
      raise exception 'permission denied: admin without branch';
    end if;
    if p_branch_id is null or p_branch_id <> v_admin_branch then
      raise exception 'permission denied: branch mismatch';
    end if;
  end if;

  return query
  with day_bounds as (
    select
      ((p_target_date::timestamp at time zone 'Asia/Seoul') + interval '6 hours') as start_ts,
      ((p_target_date::timestamp at time zone 'Asia/Seoul') + interval '27 hours') as end_ts
  ),
  branch_students as (
    select sp.id
    from student_profiles sp
    join profiles p on p.id = sp.id
    where (p_branch_id is null or p.branch_id = p_branch_id)
      and p.withdrawn_at is null
  ),
  last_event as (
    select distinct on (a.student_id) a.student_id, a.type
    from attendance a
    join branch_students bs on bs.id = a.student_id
    cross join day_bounds db
    where a.timestamp >= db.start_ts
      and a.timestamp <= db.end_ts
    order by a.student_id, a.timestamp desc
  ),
  totals as (
    select count(*)::int as branch_total from branch_students
  )
  select
    count(*) filter (where le.type in ('check_in','break_end'))::int,
    count(*) filter (where le.type = 'check_out')::int,
    count(*) filter (where le.type = 'break_start')::int,
    ((select branch_total from totals) - count(le.student_id))::int,
    (select branch_total from totals)::int
  from branch_students bs
  left join last_event le on le.student_id = bs.id;
end;
$$;

-- =============================================
-- 2) points_summary
-- =============================================
create or replace function public.points_summary(p_branch_id uuid)
returns table (
  student_id uuid,
  reward_total int,
  penalty_total int,
  net_total int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_admin_branch uuid;
  v_is_super boolean;
begin
  select branch_id, is_super_admin
    into v_admin_branch, v_is_super
    from public.profiles
   where id = auth.uid() and user_type = 'admin';
  if not found then
    raise exception 'permission denied: admin only';
  end if;
  if not v_is_super then
    if v_admin_branch is null then
      raise exception 'permission denied: admin without branch';
    end if;
    if p_branch_id is null or p_branch_id <> v_admin_branch then
      raise exception 'permission denied: branch mismatch';
    end if;
  end if;

  return query
  with branch_students as (
    select sp.id
    from student_profiles sp
    join profiles p on p.id = sp.id
    where (p_branch_id is null or p.branch_id = p_branch_id)
      and p.withdrawn_at is null
  )
  select
    bs.id,
    coalesce(sum(case when pt.type = 'reward' then pt.amount else 0 end), 0)::int,
    coalesce(sum(case when pt.type = 'penalty' then pt.amount else 0 end), 0)::int,
    coalesce(sum(case when pt.type = 'reward' then pt.amount when pt.type = 'penalty' then -pt.amount else 0 end), 0)::int
  from branch_students bs
  left join points pt on pt.student_id = bs.id
  group by bs.id;
end;
$$;

-- =============================================
-- 3) focus_weekly_summary
-- =============================================
create or replace function public.focus_weekly_summary(
  p_branch_id uuid,
  p_week_start date
)
returns table (
  student_id uuid,
  day_index int,
  total_score numeric,
  avg_score numeric,
  count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_admin_branch uuid;
  v_is_super boolean;
begin
  select branch_id, is_super_admin
    into v_admin_branch, v_is_super
    from public.profiles
   where id = auth.uid() and user_type = 'admin';
  if not found then
    raise exception 'permission denied: admin only';
  end if;
  if not v_is_super then
    if v_admin_branch is null then
      raise exception 'permission denied: admin without branch';
    end if;
    if p_branch_id is null or p_branch_id <> v_admin_branch then
      raise exception 'permission denied: branch mismatch';
    end if;
  end if;

  return query
  with branch_students as (
    select sp.id
    from student_profiles sp
    join profiles p on p.id = sp.id
    where (p_branch_id is null or p.branch_id = p_branch_id)
      and p.withdrawn_at is null
  ),
  week_bounds as (
    select
      ((p_week_start::timestamp at time zone 'Asia/Seoul') + interval '6 hours') as start_ts,
      ((p_week_start::timestamp at time zone 'Asia/Seoul') + interval '6 hours' + interval '7 days') as end_ts
  ),
  scored as (
    select
      fs.student_id,
      floor(
        extract(
          epoch from (fs.recorded_at - (select start_ts from week_bounds))
        ) / 86400
      )::int as day_index,
      fs.score
    from focus_scores fs
    join branch_students bs on bs.id = fs.student_id
    cross join week_bounds wb
    where fs.recorded_at >= wb.start_ts
      and fs.recorded_at < wb.end_ts
  )
  select
    s.student_id,
    s.day_index,
    sum(s.score)::numeric,
    avg(s.score)::numeric,
    count(*)::int
  from scored s
  where s.day_index between 0 and 6
  group by s.student_id, s.day_index;
end;
$$;

-- =============================================
-- 4) admin_search_absence_schedules
-- =============================================
create or replace function public.admin_search_absence_schedules(
  p_branch_id uuid,
  p_q text default null,
  p_type text default null,
  p_active text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (
  id uuid,
  student_id uuid,
  title text,
  description text,
  is_recurring boolean,
  recurrence_type text,
  day_of_week int[],
  start_time time,
  end_time time,
  date_type text,
  valid_from date,
  valid_until date,
  specific_date date,
  buffer_minutes int,
  is_active boolean,
  status text,
  created_by uuid,
  approved_by uuid,
  approved_at timestamptz,
  rejected_by uuid,
  rejected_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  student_name text,
  seat_number int,
  approver_name text,
  approver_user_type text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_branch uuid;
  v_is_super boolean;
  v_pat text;
begin
  select branch_id, is_super_admin
    into v_admin_branch, v_is_super
    from public.profiles
   where id = auth.uid() and user_type = 'admin';
  if not found then
    raise exception 'permission denied: admin only';
  end if;
  if not v_is_super then
    if v_admin_branch is null then
      raise exception 'permission denied: admin without branch';
    end if;
    if p_branch_id is null or p_branch_id <> v_admin_branch then
      raise exception 'permission denied: branch mismatch';
    end if;
  end if;

  v_pat := case
    when p_q is not null and p_q <> ''
    then '%' || replace(replace(replace(p_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
    else null
  end;

  return query
  with branch_students as (
    select sp.id as sid, sp.seat_number as sseat, p.name as sname
    from public.student_profiles sp
    join public.profiles p on p.id = sp.id
    where (p_branch_id is null or p.branch_id = p_branch_id)
      and p.withdrawn_at is null
  ),
  filtered as (
    select
      sas.*,
      bs.sname as _student_name,
      bs.sseat as _seat_number,
      ap.name as _approver_name,
      ap.user_type as _approver_user_type
    from public.student_absence_schedules sas
    join branch_students bs on bs.sid = sas.student_id
    left join public.profiles ap on ap.id = sas.approved_by
    where (v_pat is null or sas.title ilike v_pat or bs.sname ilike v_pat)
      and (
        p_type is null
        or (p_type = 'recurring' and sas.is_recurring = true)
        or (p_type = 'one_time' and sas.is_recurring = false)
      )
      and (
        p_active is null
        or (p_active = 'active' and sas.is_active = true)
        or (p_active = 'inactive' and sas.is_active = false)
      )
  ),
  counted as (select count(*)::bigint as cnt from filtered)
  select
    f.id, f.student_id, f.title, f.description, f.is_recurring,
    f.recurrence_type, f.day_of_week, f.start_time, f.end_time,
    f.date_type, f.valid_from, f.valid_until, f.specific_date,
    f.buffer_minutes, f.is_active, f.status, f.created_by,
    f.approved_by, f.approved_at, f.rejected_by, f.rejected_at,
    f.created_at, f.updated_at,
    f._student_name, f._seat_number, f._approver_name, f._approver_user_type,
    (select cnt from counted)
  from filtered f
  order by f.created_at desc
  limit p_limit offset p_offset;
end;
$$;

-- =============================================
-- 5) get_admin_unread_chat_count — 슈퍼는 전 지점 합산
-- =============================================
create or replace function public.get_admin_unread_chat_count()
returns bigint
language plpgsql
stable security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_branch uuid;
  v_is_super boolean;
begin
  select branch_id, is_super_admin
    into v_admin_branch, v_is_super
    from public.profiles
   where id = auth.uid() and user_type = 'admin';
  if not found then
    return 0;
  end if;

  if v_is_super then
    return (
      select count(*)::bigint
      from public.chat_messages cm
      join public.chat_rooms cr on cr.id = cm.room_id
      join public.student_profiles sp on sp.id = cr.student_id
      join public.profiles p on p.id = sp.id
      where cm.is_read_by_admin = false
        and p.withdrawn_at is null
    );
  end if;

  return (
    select count(*)::bigint
    from public.chat_messages cm
    join public.chat_rooms cr on cr.id = cm.room_id
    join public.student_profiles sp on sp.id = cr.student_id
    join public.profiles p on p.id = sp.id
    where cm.is_read_by_admin = false
      and p.withdrawn_at is null
      and p.branch_id = v_admin_branch
  );
end;
$$;

-- =============================================
-- 6) get_chat_room_list — 슈퍼는 p_admin_id branch 가드 우회
-- =============================================
-- p_admin_id 인자는 caller 가 임의로 다른 어드민의 branch 로 필터링하라는 힌트.
-- 슈퍼관리자가 호출 시 그 admin 의 branch 가 NULL 이거나 슈퍼면 전체 노출.
create or replace function public.get_chat_room_list(
  p_limit integer default 30,
  p_offset integer default 0,
  p_search text default null,
  p_admin_id uuid default null
)
returns table(
  id uuid,
  student_id uuid,
  created_at timestamp with time zone,
  student_name text,
  seat_number integer,
  unread_count bigint,
  last_message text,
  last_message_at timestamp with time zone
)
language sql
stable security definer
set search_path = public, pg_temp
as $function$
  select
    cr.id,
    cr.student_id,
    cr.created_at,
    p.name as student_name,
    sp.seat_number,
    count(*) filter (where cm.id is not null and not cm.is_read_by_admin) as unread_count,
    (
      select cm2.content from public.chat_messages cm2
      where cm2.room_id = cr.id
      order by cm2.created_at desc limit 1
    ) as last_message,
    coalesce(
      (
        select cm3.created_at from public.chat_messages cm3
        where cm3.room_id = cr.id
        order by cm3.created_at desc limit 1
      ),
      cr.created_at
    ) as last_message_at
  from public.chat_rooms cr
  join public.student_profiles sp on sp.id = cr.student_id
  join public.profiles p on p.id = sp.id
  left join public.chat_messages cm on cm.room_id = cr.id
  where
    p.is_approved = true
    and p.withdrawn_at is null
    and (p_search is null or p_search = '' or p.name ilike '%' || p_search || '%')
    and (
      -- p_admin_id 가 null 이면 branch 필터 없음 (슈퍼/시스템)
      p_admin_id is null
      -- p_admin_id 의 어드민이 슈퍼면 전 지점
      or exists (
        select 1 from public.profiles ap
         where ap.id = p_admin_id
           and ap.user_type = 'admin'
           and ap.is_super_admin = true
      )
      -- 그 외에는 그 어드민의 branch 와 학생 branch 일치
      or p.branch_id = (
        select branch_id from public.profiles where id = p_admin_id limit 1
      )
    )
  group by cr.id, cr.student_id, cr.created_at, p.name, sp.seat_number
  order by last_message_at desc nulls last
  limit p_limit offset p_offset;
$function$;

-- =============================================
-- 7) create_meal_product_with_variant — 슈퍼는 어떤 p_branch_id 든 통과
-- =============================================
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
begin
  select branch_id, is_super_admin
    into v_admin_branch, v_is_super
    from public.profiles
   where id = auth.uid() and user_type = 'admin';

  if not found then
    raise exception 'permission denied: admin only';
  end if;

  if not v_is_super then
    if v_admin_branch is null then
      raise exception 'permission denied: admin without branch';
    end if;
    if p_branch_id is null or p_branch_id <> v_admin_branch then
      raise exception 'permission denied: branch mismatch';
    end if;
  end if;

  if p_branch_id is null then
    raise exception '지점이 지정되지 않았습니다.';
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

-- =============================================
-- 8) update_meal_product_with_variant — 슈퍼는 대상 row 의 branch 우회
-- =============================================
-- 시그니처(반환 컬럼명 out_*)는 20260427084804 와 동일하게 유지.
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
  v_is_super boolean;
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
  select branch_id, is_super_admin
    into v_admin_branch, v_is_super
    from public.profiles
   where id = auth.uid() and user_type = 'admin';

  if not found then
    raise exception 'permission denied: admin only';
  end if;

  select branch_id, category into v_product_branch, v_category
  from public.meal_products
  where id = p_product_id;

  if v_product_branch is null then
    raise exception '상품을 찾을 수 없습니다.';
  end if;

  if not v_is_super then
    if v_admin_branch is null then
      raise exception 'permission denied: admin without branch';
    end if;
    if v_product_branch <> v_admin_branch then
      raise exception 'permission denied: branch mismatch';
    end if;
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
