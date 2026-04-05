-- 멘토 프로필 이미지 Storage 버킷 + RLS 정책
-- mentors.profile_image_url 컬럼은 이미 존재하므로 스키마 변경 없음

-- 1) Storage 버킷 (public 읽기)
INSERT INTO storage.buckets (id, name, public)
VALUES ('mentor-images', 'mentor-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2) Storage RLS 정책

-- 공개 읽기
DROP POLICY IF EXISTS "mentor_images_select_public" ON storage.objects;
CREATE POLICY "mentor_images_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'mentor-images');

-- 관리자만 업로드 (자신 uid 폴더)
DROP POLICY IF EXISTS "mentor_images_insert_admin" ON storage.objects;
CREATE POLICY "mentor_images_insert_admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'mentor-images'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 관리자만 수정
DROP POLICY IF EXISTS "mentor_images_update_admin" ON storage.objects;
CREATE POLICY "mentor_images_update_admin"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'mentor-images'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

-- 관리자만 삭제
DROP POLICY IF EXISTS "mentor_images_delete_admin" ON storage.objects;
CREATE POLICY "mentor_images_delete_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'mentor-images'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );
