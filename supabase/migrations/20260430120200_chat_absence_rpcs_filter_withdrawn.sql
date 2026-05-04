-- get_chat_room_list 와 admin_search_absence_schedules 의 학생 조회 부분에
-- 퇴원생 제외 필터를 추가한다. 정의 본문 외 시그니처/grant 는 그대로 유지된다.

-- ========================================================================
-- 1) get_chat_room_list — 퇴원 학생의 채팅방은 관리자 목록에서 숨김
-- ========================================================================
CREATE OR REPLACE FUNCTION public.get_chat_room_list(
  p_limit integer DEFAULT 30,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL::text,
  p_admin_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  id uuid,
  student_id uuid,
  created_at timestamp with time zone,
  student_name text,
  seat_number integer,
  unread_count bigint,
  last_message text,
  last_message_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT
    cr.id,
    cr.student_id,
    cr.created_at,
    p.name AS student_name,
    sp.seat_number,
    COUNT(*) FILTER (WHERE cm.id IS NOT NULL AND NOT cm.is_read_by_admin) AS unread_count,
    (
      SELECT cm2.content
      FROM chat_messages cm2
      WHERE cm2.room_id = cr.id
      ORDER BY cm2.created_at DESC
      LIMIT 1
    ) AS last_message,
    COALESCE(
      (
        SELECT cm3.created_at
        FROM chat_messages cm3
        WHERE cm3.room_id = cr.id
        ORDER BY cm3.created_at DESC
        LIMIT 1
      ),
      cr.created_at
    ) AS last_message_at
  FROM chat_rooms cr
  JOIN student_profiles sp ON sp.id = cr.student_id
  JOIN profiles p ON p.id = sp.id
  LEFT JOIN chat_messages cm ON cm.room_id = cr.id
  WHERE
    p.is_approved = true
    AND p.withdrawn_at IS NULL
    AND (p_search IS NULL OR p_search = '' OR p.name ILIKE '%' || p_search || '%')
    AND (
      p_admin_id IS NULL
      OR p.branch_id = (
        SELECT branch_id FROM profiles WHERE id = p_admin_id LIMIT 1
      )
    )
  GROUP BY cr.id, cr.student_id, cr.created_at, p.name, sp.seat_number
  ORDER BY last_message_at DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
$function$;

-- get_admin_unread_chat_count — 관리자 미확인 카운트도 활성 학생만 집계
CREATE OR REPLACE FUNCTION public.get_admin_unread_chat_count()
RETURNS bigint
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT COUNT(*)::bigint
  FROM chat_messages cm
  JOIN chat_rooms cr ON cr.id = cm.room_id
  JOIN student_profiles sp ON sp.id = cr.student_id
  JOIN profiles p ON p.id = sp.id
  WHERE cm.is_read_by_admin = false
    AND p.withdrawn_at IS NULL
    AND p.branch_id = (
      SELECT branch_id
      FROM profiles
      WHERE id = auth.uid()
        AND user_type = 'admin'
      LIMIT 1
    );
$function$;

-- ========================================================================
-- 2) admin_search_absence_schedules — 결석 일정도 활성 학생만 조회 대상
-- ========================================================================
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
