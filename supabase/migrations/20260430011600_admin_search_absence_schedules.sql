-- 어드민 부재 일정 검색 RPC.
-- 학생 이름(profiles.name) + 일정 제목(title) OR 검색을 PostgREST 일반 select 로
-- 처리할 수 없어 RPC 로 분리. 권한 검증은 count_attendance_status (20260429075002)
-- 표준 패턴을 그대로 따른다 — admin 자격 + 호출자 branch 일치.

create or replace function public.admin_search_absence_schedules(
  p_branch_id uuid,
  p_q text default null,
  p_type text default null,    -- 'recurring' | 'one_time' | null
  p_active text default null,  -- 'active' | 'inactive' | null
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
  v_pat text;
begin
  select branch_id into v_admin_branch
    from public.profiles
   where id = auth.uid() and user_type = 'admin';
  if v_admin_branch is null then
    raise exception 'permission denied: admin only';
  end if;
  if p_branch_id <> v_admin_branch then
    raise exception 'permission denied: branch mismatch';
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
    where p.branch_id = p_branch_id
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

grant execute on function public.admin_search_absence_schedules(uuid, text, text, text, int, int) to authenticated;
