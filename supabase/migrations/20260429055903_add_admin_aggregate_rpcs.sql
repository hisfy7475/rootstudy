-- 어드민 페이지 집계 RPC.
-- 현재 클라이언트/서버에서 fetchAllPaged + JS reduce 로 계산하는 통계를
-- 단일 SQL 쿼리로 대체.

-- =============================================
-- count_attendance_status
-- =============================================
-- 대시보드 + 출석부의 입실/퇴실/외출/미도착 카운트.
-- 학습일 KST 윈도우: target_date 06:00 KST → (target_date+1) 03:00 KST.
-- 학생 마지막 출입 이벤트 종류로 상태 분류.
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
language sql
stable
security definer
set search_path = public
as $$
  with day_bounds as (
    -- KST 06:00 ~ 다음날 03:00 (UTC 기준 전날 21:00 ~ 당일 18:00)
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
    count(*) filter (where le.type in ('check_in','break_end'))::int as checked_in,
    count(*) filter (where le.type = 'check_out')::int as checked_out,
    count(*) filter (where le.type = 'break_start')::int as on_break,
    ((select branch_total from totals) - count(le.student_id))::int as not_yet_arrived,
    (select branch_total from totals)::int as total
  from branch_students bs
  left join last_event le on le.student_id = bs.id;
$$;

grant execute on function public.count_attendance_status(uuid, date) to authenticated;

comment on function public.count_attendance_status(uuid, date) is
  '지점의 학습일 (KST 06:00 → +27h) 출결 상태 카운트. 대시보드/출석부 stats.';

-- =============================================
-- points_summary
-- =============================================
-- 상벌점 overview 용. 학생별 reward/penalty/net 합계.
-- 현행 getPointsOverview 의 fetchAllPaged + JS reduce 대체.
create or replace function public.points_summary(p_branch_id uuid)
returns table (
  student_id uuid,
  reward_total int,
  penalty_total int,
  net_total int
)
language sql
stable
security definer
set search_path = public
as $$
  with branch_students as (
    select sp.id
    from student_profiles sp
    join profiles p on p.id = sp.id
    where p.branch_id = p_branch_id
  )
  select
    bs.id as student_id,
    coalesce(sum(case when pt.type = 'reward' then pt.amount else 0 end), 0)::int as reward_total,
    coalesce(sum(case when pt.type = 'penalty' then pt.amount else 0 end), 0)::int as penalty_total,
    coalesce(sum(case when pt.type = 'reward' then pt.amount when pt.type = 'penalty' then -pt.amount else 0 end), 0)::int as net_total
  from branch_students bs
  left join points pt on pt.student_id = bs.id
  group by bs.id;
$$;

grant execute on function public.points_summary(uuid) to authenticated;

comment on function public.points_summary(uuid) is
  '지점 학생들의 상벌점 합계 (reward/penalty/net). 상벌점 overview 페이지.';

-- =============================================
-- focus_weekly_summary
-- =============================================
-- 주간 몰입도 리포트. 학생 × KST 학습일(0~6) 단위로 평균/합계.
-- p_week_start 는 KST 월요일 (YYYY-MM-DD).
create or replace function public.focus_weekly_summary(
  p_branch_id uuid,
  p_week_start date
)
returns table (
  student_id uuid,
  day_index int,         -- 0=월, 6=일
  total_score numeric,
  avg_score numeric,
  count int
)
language sql
stable
security definer
set search_path = public
as $$
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
      -- 각 점수의 학습일 인덱스: KST 기준 (recorded_at - week_start_06KST) / 24h
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
    sum(s.score)::numeric as total_score,
    avg(s.score)::numeric as avg_score,
    count(*)::int as count
  from scored s
  where s.day_index between 0 and 6
  group by s.student_id, s.day_index;
$$;

grant execute on function public.focus_weekly_summary(uuid, date) to authenticated;

comment on function public.focus_weekly_summary(uuid, date) is
  '지점 학생들의 KST 주간 몰입도 합계/평균/개수 (day_index 0=월요일).';
