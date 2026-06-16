-- 또래 학습시간 벤치마크 집계 RPC
-- 배경: report.ts 의 또래 평균/최고치 계산이 또래 전원 attendance 원본(수만 행)을 앱으로
--   fetch 후 JS 집계 → 프로덕션 디스크 IO 최대 소비(temp 스필 15GB). 동일 로직을 DB 집계로 이전.
-- 중요(동작 100% 일치):
--   1) 기존 JS 또래 경로는 byStudent 에 {type,timestamp} 만 담아 source/gate_name 을 버린다.
--      따라서 isStudyExcluded(게이트 제외)가 적용되지 않으므로 RPC 도 게이트 제외를 적용하지 않는다.
--   2) 세션 상태머신: OPEN={check_in,break_end}(checkin 갱신/덮어쓰기), CLOSE={check_out,break_start}
--      (열려 있으면 세션 마감 후 clear, 닫혀 있으면 무시). 미마감 세션은 LEAST(now(), cap) 로 마감.
--      duration = floor(epoch 초). 마지막 미마감은 부호 가드 없이 그대로 합산(JS 와 동일).
--   3) my_seconds(본인)는 민감정보라 RPC 가 반환하지 않고 호출부(JS)에서 본인 데이터로 계산한다.
--      RPC 는 개인 식별이 불가능한 집계값(최고치/상위30% 평균)만 반환한다.
-- 검증: scripts 의 비교 하니스로 dev 실데이터 288건(비-0 279건) JS 와 100% 일치 확인 후 적용.

create or replace function public._study_seconds_for(
  p_student_ids uuid[],
  p_start timestamptz,
  p_end timestamptz,
  p_inclusive_end boolean,
  p_cap timestamptz
) returns table(student_id uuid, seconds bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  cur uuid := null;
  checkin_ts timestamptz := null;
  acc bigint := 0;
  eff_end timestamptz;
begin
  if p_student_ids is null or array_length(p_student_ids,1) is null then
    return;
  end if;
  for r in
    select a.student_id as sid, a.type as t, a."timestamp" as ts
    from public.attendance a
    where a.student_id = any(p_student_ids)
      and a."timestamp" >= p_start
      and (case when p_inclusive_end then a."timestamp" <= p_end else a."timestamp" < p_end end)
    order by a.student_id, a."timestamp"
  loop
    if cur is distinct from r.sid then
      if cur is not null then
        if checkin_ts is not null then
          eff_end := least(now(), p_cap);
          acc := acc + floor(extract(epoch from (eff_end - checkin_ts)))::bigint;
        end if;
        student_id := cur; seconds := acc; return next;
      end if;
      cur := r.sid; checkin_ts := null; acc := 0;
    end if;

    if r.t in ('check_in','break_end') then
      checkin_ts := r.ts;
    elsif r.t in ('check_out','break_start') then
      if checkin_ts is not null then
        acc := acc + floor(extract(epoch from (r.ts - checkin_ts)))::bigint;
        checkin_ts := null;
      end if;
    end if;
  end loop;

  if cur is not null then
    if checkin_ts is not null then
      eff_end := least(now(), p_cap);
      acc := acc + floor(extract(epoch from (eff_end - checkin_ts)))::bigint;
    end if;
    student_id := cur; seconds := acc; return next;
  end if;
end;
$$;

revoke all on function public._study_seconds_for(uuid[],timestamptz,timestamptz,boolean,timestamptz) from public;

-- 주간 리포트용: 또래(학년, 본인 제외) 상위 30% 학습시간 평균(초). 기간은 [start,end] 포함.
create or replace function public.peer_top_avg_seconds(
  p_student_type_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_exclude_student uuid
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
    and p.withdrawn_at is null
    and sp.id <> p_exclude_student;
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

-- 추이용: 주차별 또래 최고치(본인 포함)와 상위30% 평균(본인 제외). 기간은 [start,end) 배타.
-- 미마감 세션 cap = end - 1ms (JS weeklyStudySecondsFromAttendance 의 sessionCap 재현; LEAST(now(),cap)).
create or replace function public.peer_bench_trend(
  p_student_type_id uuid,
  p_self_student uuid,
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
  v_n_peers int;
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

  select count(*) into v_n_peers from unnest(v_type_ids) x where x <> p_self_student;
  v_k := greatest(1, ceil(v_n_peers * 0.3))::int;

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
          select seconds as s2 from secs where tid <> p_self_student order by seconds desc limit v_k
        ) t
      ),0)
    into v_max, v_avg
    from secs;

    week_idx := i;
    grade_max_seconds := v_max;
    peer_avg_seconds := coalesce(v_avg,0)::int;
    if v_n_peers = 0 then peer_avg_seconds := 0; end if;
    return next;
  end loop;
end;
$$;

grant execute on function public.peer_bench_trend(uuid,uuid,timestamptz[],timestamptz[]) to authenticated;
