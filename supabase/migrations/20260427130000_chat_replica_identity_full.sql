-- chat_messages / chat_rooms 의 REPLICA IDENTITY 를 FULL 로 설정.
-- 이유: Supabase Realtime postgres_changes 는 listener 별 RLS 를 평가해 broadcast 한다.
--       REPLICA IDENTITY DEFAULT(=PK) 는 UPDATE 이벤트의 WAL payload 에 PK + 변경 컬럼만 포함하므로
--       branch_id 가 변경되지 않은 UPDATE(예: is_read_by_admin 토글)에서 payload 에 branch_id 가 없고,
--       정책 `branch_id = get_admin_branch_id()` 가 NULL 비교로 실패해 admin 에게 이벤트가 도달하지 않는다.
--       FULL 로 두면 UPDATE/DELETE WAL 에 전체 row 가 포함되어 RLS 평가에 필요한 모든 컬럼이 들어간다.

ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.chat_rooms    REPLICA IDENTITY FULL;
