-- 어드민 집계 RPC 3종의 branch_students CTE 에 퇴원생 제외 필터를 추가한다.
-- 출결/상벌점/몰입도 통계는 활성 학생만 집계되어야 하므로
-- 20260430120000 에서 추가된 profiles.withdrawn_at IS NULL 조건을 반영한다.
-- 시그니처/반환 컬럼/security definer/grants 는 모두 그대로 유지된다.

-- =============================================
-- count_attendance_status
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
    where p.branch_id = p_branch_id
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
-- points_summary
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

  return query
  with branch_students as (
    select sp.id
    from student_profiles sp
    join profiles p on p.id = sp.id
    where p.branch_id = p_branch_id
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
-- focus_weekly_summary
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

  return query
  with branch_students as (
    select sp.id
    from student_profiles sp
    join profiles p on p.id = sp.id
    where p.branch_id = p_branch_id
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
