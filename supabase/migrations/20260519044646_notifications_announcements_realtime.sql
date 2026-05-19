-- student_notifications / user_notifications / announcements / announcement_reads
-- 를 Supabase Realtime publication 에 등록 + REPLICA IDENTITY FULL 설정.
-- chat_realtime_publication 및 chat_replica_identity_full 마이그레이션과 동일 패턴.
-- ADD TABLE 은 중복 시 에러를 내므로 pg_publication_tables 로 idempotent 처리.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'student_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.student_notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'user_notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'announcement_reads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.announcement_reads;
  END IF;
END $$;

-- REPLICA IDENTITY FULL: UPDATE/DELETE WAL payload 에 전체 row 를 포함시켜
-- listener 별 RLS 평가에 필요한 모든 컬럼이 들어가도록 한다.
ALTER TABLE public.student_notifications REPLICA IDENTITY FULL;
ALTER TABLE public.user_notifications    REPLICA IDENTITY FULL;
ALTER TABLE public.announcements         REPLICA IDENTITY FULL;
ALTER TABLE public.announcement_reads    REPLICA IDENTITY FULL;
