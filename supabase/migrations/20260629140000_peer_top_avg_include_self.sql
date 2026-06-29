-- 또래 학습시간 벤치마크: "동일학년 상위 30% 평균"을 본인 제외 → 본인 포함(학년 전체)으로 변경.
-- 배경: 기존 산식은 보는 학생 본인을 또래 집합에서 제외(p_exclude_student/p_self_student)했다.
--   이는 과거 클라이언트 요청("평균은 본인 제외")을 구현한 것이나, 본인 제외는 보는 학생마다
--   모집단에서 자기 1명을 빼므로 상위 30% 집합/인원(k=ceil((n-1)*0.3))이 학생마다 달라져
--   같은 학년·같은 주차인데도 표시값이 달라졌다(상위권일수록 본인 고득점이 빠져 더 낮게 표시).
-- 변경: 클라이언트가 "모든 동일학년 학생에게 동일 값"을 요청 → 본인 제외를 제거하고
--   학년 전체(본인 포함) 상위 30% 평균으로 산출한다. 라벨 "동일학년 상위 30% 평균"이
--   문자 그대로 정확해지고, 같은 학년 모든 학생이 동일 값을 본다.
-- 호환: 함수 시그니처는 유지한다(p_exclude_student / p_self_student 파라미터를 남기되 미사용).
--   따라서 create or replace 로 교체 가능하고 호출부(report.ts)는 수정 불필요하다.
--   grade_max_seconds(동일학년 최고)는 원래 본인 포함 전체 기준이라 변경하지 않는다.
-- _study_seconds_for 는 변경 없음(20260616010000 정의 그대로 사용).

-- 주간 리포트용: 또래(학년, 본인 포함) 상위 30% 학습시간 평균(초). 기간은 [start,end] 포함.
create or replace function public.peer_top_avg_seconds(
  p_student_type_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_exclude_student uuid  -- 미사용(시그니처 유지용). 본인 포함으로 변경되어 더 이상 제외하지 않음.
) returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
  v_n int;
  v_k int;
  v_avg numeric;
begin
  if p_student_type_id is null then return 0; end if;
  select array_agg(sp.id) into v_ids
  from public.student_profiles sp
  join public.profiles p on p.id = sp.id
  where sp.student_type_id = p_student_type_id
    and p.withdrawn_at is null;
  if v_ids is null or array_length(v_ids,1) is null then return 0; end if;
  v_n := array_length(v_ids,1);
  v_k := greatest(1, ceil(v_n * 0.3))::int;

  with secs as (
    select coalesce(f.seconds, 0) as seconds
    from unnest(v_ids) as pid
    left join public._study_seconds_for(v_ids, p_period_start, p_period_end, true, p_period_end) f
      on f.student_id = pid
  ), top as (
    select seconds from secs order by seconds desc limit v_k
  )
  select round(avg(seconds)) into v_avg from top;
  return coalesce(v_avg, 0)::int;
end;
$$;

grant execute on function public.peer_top_avg_seconds(uuid,timestamptz,timestamptz,uuid) to authenticated;

-- 추이용: 주차별 또래 최고치(전체)와 상위30% 평균(본인 포함). 기간은 [start,end) 배타.
-- 미마감 세션 cap = end - 1ms (JS weeklyStudySecondsFromAttendance 의 sessionCap 재현; LEAST(now(),cap)).
create or replace function public.peer_bench_trend(
  p_student_type_id uuid,
  p_self_student uuid,  -- 미사용(시그니처 유지용). 평균이 본인 포함으로 변경되어 더 이상 제외하지 않음.
  p_week_starts timestamptz[],
  p_week_ends timestamptz[]
) returns table(week_idx int, grade_max_seconds bigint, peer_avg_seconds integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_type_ids uuid[];
  v_n int;
  v_k int;
  i int;
  v_start timestamptz;
  v_end timestamptz;
  v_cap timestamptz;
  v_max bigint;
  v_avg numeric;
begin
  if p_week_starts is null or array_length(p_week_starts,1) is null then return; end if;

  if p_student_type_id is not null then
    select array_agg(sp.id) into v_type_ids
    from public.student_profiles sp
    join public.profiles p on p.id = sp.id
    where sp.student_type_id = p_student_type_id
      and p.withdrawn_at is null;
  end if;

  if v_type_ids is null then
    for i in 1 .. array_length(p_week_starts,1) loop
      week_idx := i; grade_max_seconds := 0; peer_avg_seconds := 0; return next;
    end loop;
    return;
  end if;

  v_n := array_length(v_type_ids,1);
  v_k := greatest(1, ceil(v_n * 0.3))::int;

  for i in 1 .. array_length(p_week_starts,1) loop
    v_start := p_week_starts[i];
    v_end := p_week_ends[i];
    v_cap := v_end - interval '1 millisecond';

    with secs as (
      select tid, coalesce(f.seconds,0) as seconds
      from unnest(v_type_ids) as tid
      left join public._study_seconds_for(v_type_ids, v_start, v_end, false, v_cap) f
        on f.student_id = tid
    )
    select
      coalesce(max(seconds),0),
      coalesce((
        select round(avg(s2)) from (
          select seconds as s2 from secs order by seconds desc limit v_k
        ) t
      ),0)
    into v_max, v_avg
    from secs;

    week_idx := i;
    grade_max_seconds := v_max;
    peer_avg_seconds := coalesce(v_avg,0)::int;
    if v_n = 0 then peer_avg_seconds := 0; end if;
    return next;
  end loop;
end;
$$;

grant execute on function public.peer_bench_trend(uuid,uuid,timestamptz[],timestamptz[]) to authenticated;
