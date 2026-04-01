-- Phase 4: 채팅 파일 컬럼 + 공지 첨부 테이블 + Storage 버킷/정책
-- Supabase SQL Editor 또는 CLI로 적용

-- 1) chat_messages
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_type text;

COMMENT ON COLUMN public.chat_messages.file_type IS 'image | file (일반 첨부)';

-- 2) announcement_attachments
CREATE TABLE IF NOT EXISTS public.announcement_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.announcements(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  mime_type text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_announcement_attachments_announcement_id
  ON public.announcement_attachments(announcement_id);

ALTER TABLE public.announcement_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "announcement_attachments_read" ON public.announcement_attachments;
CREATE POLICY "announcement_attachments_read"
  ON public.announcement_attachments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.announcements a
      INNER JOIN public.profiles p ON p.id = auth.uid()
      WHERE a.id = announcement_attachments.announcement_id
        AND (
          p.user_type = 'admin'
          OR (
            p.user_type = 'student'
            AND a.target_audience IN ('all', 'student')
            AND (a.branch_id IS NULL OR a.branch_id = p.branch_id)
          )
          OR (
            p.user_type = 'parent'
            AND a.target_audience IN ('all', 'parent')
            AND (a.branch_id IS NULL OR a.branch_id = p.branch_id)
          )
        )
    )
  );

DROP POLICY IF EXISTS "announcement_attachments_insert_admin" ON public.announcement_attachments;
CREATE POLICY "announcement_attachments_insert_admin"
  ON public.announcement_attachments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "announcement_attachments_update_admin" ON public.announcement_attachments;
CREATE POLICY "announcement_attachments_update_admin"
  ON public.announcement_attachments FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "announcement_attachments_delete_admin" ON public.announcement_attachments;
CREATE POLICY "announcement_attachments_delete_admin"
  ON public.announcement_attachments FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

-- 3) Storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-files', 'chat-files', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('announcement-files', 'announcement-files', true)
ON CONFLICT (id) DO NOTHING;

-- chat-files: 공개 읽기, 인증 사용자가 자신 uid 폴더에만 업로드/삭제
DROP POLICY IF EXISTS "chat_files_select_public" ON storage.objects;
CREATE POLICY "chat_files_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'chat-files');

DROP POLICY IF EXISTS "chat_files_insert_own_folder" ON storage.objects;
CREATE POLICY "chat_files_insert_own_folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "chat_files_update_own_folder" ON storage.objects;
CREATE POLICY "chat_files_update_own_folder"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'chat-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "chat_files_delete_own_folder" ON storage.objects;
CREATE POLICY "chat_files_delete_own_folder"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- announcement-files: 공개 읽기, 관리자만 업로드/수정/삭제 (uid 폴더)
DROP POLICY IF EXISTS "announcement_files_select_public" ON storage.objects;
CREATE POLICY "announcement_files_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'announcement-files');

DROP POLICY IF EXISTS "announcement_files_insert_admin" ON storage.objects;
CREATE POLICY "announcement_files_insert_admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'announcement-files'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "announcement_files_update_admin" ON storage.objects;
CREATE POLICY "announcement_files_update_admin"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'announcement-files'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "announcement_files_delete_admin" ON storage.objects;
CREATE POLICY "announcement_files_delete_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'announcement-files'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );
