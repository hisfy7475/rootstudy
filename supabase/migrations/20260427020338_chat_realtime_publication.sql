-- public.chat_messages / public.chat_rooms 를 Supabase Realtime publication 에 등록.
-- 누락 시 INSERT/UPDATE/DELETE 가 broadcast 되지 않아 사이드바 미확인 배지 동기화 등이 깨진다.
-- ADD TABLE 은 중복 등록 시 에러를 내므로 pg_publication_tables 로 idempotent 처리.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'chat_rooms'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_rooms;
  END IF;
END $$;
