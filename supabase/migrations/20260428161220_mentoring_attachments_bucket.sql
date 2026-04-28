-- 멘토링/클리닉/상담 신청 첨부 사진 Storage 버킷
-- chat-files 패턴: 공개 읽기, 인증 사용자가 자기 uid 폴더에만 업로드/삭제

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'mentoring-attachments',
  'mentoring-attachments',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "mentoring_attachments_select_public" ON storage.objects;
CREATE POLICY "mentoring_attachments_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'mentoring-attachments');

DROP POLICY IF EXISTS "mentoring_attachments_insert_own_folder" ON storage.objects;
CREATE POLICY "mentoring_attachments_insert_own_folder"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'mentoring-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "mentoring_attachments_delete_own_folder" ON storage.objects;
CREATE POLICY "mentoring_attachments_delete_own_folder"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'mentoring-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
