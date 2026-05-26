-- 멘토링/클리닉/상담 신청 첨부 파일 (PDF·문서 등) Storage 버킷
-- chat-files 패턴: 공개 읽기, 인증 사용자가 자기 uid 폴더에만 업로드/삭제
-- MIME 화이트리스트는 DB가 아닌 서버 액션(shared/uploads/attachments.ts)에서 검증

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mentoring-files',
  'mentoring-files',
  true,
  20971520,
  NULL
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "mentoring_files_select_public" ON storage.objects;
CREATE POLICY "mentoring_files_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'mentoring-files');

DROP POLICY IF EXISTS "mentoring_files_insert_own_folder" ON storage.objects;
CREATE POLICY "mentoring_files_insert_own_folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'mentoring-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "mentoring_files_delete_own_folder" ON storage.objects;
CREATE POLICY "mentoring_files_delete_own_folder"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'mentoring-files'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
