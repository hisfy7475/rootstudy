-- 대시보드 Realtime 채널이 attendance 변경을 받도록 publication 에 추가.
-- RLS 가 자동 적용되므로 admin 은 자기 branch attendance 변경만 수신.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'attendance'
  ) then
    alter publication supabase_realtime add table public.attendance;
  end if;
end $$;

-- attendance REPLICA IDENTITY FULL — Realtime 페이로드에 모든 컬럼 포함.
alter table public.attendance replica identity full;
