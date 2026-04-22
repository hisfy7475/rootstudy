-- 급식 이미지 지원: 컬럼 추가 + Storage 버킷 + RLS 정책

-- 1) meal_products에 대표 이미지 컬럼
ALTER TABLE public.meal_products
  ADD COLUMN IF NOT EXISTS image_url text;

-- 2) meal_menus에 식단 사진 컬럼
ALTER TABLE public.meal_menus
  ADD COLUMN IF NOT EXISTS image_url text;

-- 3) Storage 버킷 (public 읽기)
INSERT INTO storage.buckets (id, name, public)
VALUES ('meal-images', 'meal-images', true)
ON CONFLICT (id) DO NOTHING;

-- 4) Storage RLS 정책

-- 공개 읽기
DROP POLICY IF EXISTS "meal_images_select_public" ON storage.objects;
CREATE POLICY "meal_images_select_public"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'meal-images');

-- 관리자만 업로드 (자신 uid 폴더)
DROP POLICY IF EXISTS "meal_images_insert_admin" ON storage.objects;
CREATE POLICY "meal_images_insert_admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'meal-images'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- 관리자만 수정
DROP POLICY IF EXISTS "meal_images_update_admin" ON storage.objects;
CREATE POLICY "meal_images_update_admin"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'meal-images'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );

-- 관리자만 삭제
DROP POLICY IF EXISTS "meal_images_delete_admin" ON storage.objects;
CREATE POLICY "meal_images_delete_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'meal-images'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.user_type = 'admin'
    )
  );
