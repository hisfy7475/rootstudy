-- admin_search_absence_schedules 의 권한 검증 SELECT 에서
-- `where id = auth.uid()` 의 `id` 가 RETURNS TABLE 의 OUT 파라미터 `id uuid`
-- 와 충돌하여 PL/pgSQL `variable_conflict = error` 기본값이
-- "column reference \"id\" is ambiguous" 를 던졌다.
-- (/admin/schedules 페이지에서 RPC 호출 시 42702 발생)
--
-- 같은 마이그레이션(20260504013901)의 다른 RPC 7개는 RETURNS TABLE 에 `id`
-- 컬럼이 없어 영향이 없다. 본문은 동일하게 두고 WHERE 절만
-- `profiles.id = auth.uid()` 로 한정한다.

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
  select profiles.branch_id, profiles.is_super_admin
    into v_admin_branch, v_is_super
    from public.profiles
   where profiles.id = auth.uid() and profiles.user_type = 'admin';
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
