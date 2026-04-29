-- 어드민 집계 RPC 보안 가드 보강.
-- 20260429055903 에서 추가된 3종 (count_attendance_status, points_summary,
-- focus_weekly_summary) 이 security definer + grant authenticated 인데
-- 내부 가드가 없어 학생/학부모가 임의 branch_id 로 호출해 다른 지점 통계 및
-- 학생별 상벌점 합계를 enumerate 할 수 있었음.
--
-- 본 마이그레이션은 시그니처(인자/반환 컬럼)를 그대로 유지하면서 본문을
-- PLPGSQL 로 감싸 admin 자격 + 호출자 branch 일치 검증을 추가한다.
-- create or replace 라 기존 grant 는 보존된다.
--
-- 참고 패턴: 20260427094832_create_meal_product_variant_branch_guard.sql

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
