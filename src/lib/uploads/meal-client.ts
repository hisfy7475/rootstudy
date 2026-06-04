// 식사/모의고사 이미지 업로드의 클라이언트 래퍼.
//
// MealImageUploader의 onUpload(formData) 시그니처를 그대로 유지하면서, 내부적으로
// 브라우저 → Supabase Storage 직접 업로드 후 record* 서버 액션으로 DB에 기록한다.
// (기존 uploadMealProductImage/uploadMealMenuImage 서버 액션을 대체 — 호출부는 import
//  경로만 이 파일로 바꾸면 된다.)

import { recordMealProductImage, recordMealMenuImage } from '@/lib/actions/meal';
import { uploadToBucketAsUser, deleteStorageObjectAsUser } from '@/lib/uploads/client';
import {
  ATTACHMENT_IMAGE_MAX_BYTES,
  ATTACHMENT_IMAGE_MIME_TYPES,
  sanitizeAttachmentSegment,
} from '@shared/uploads/attachments';

const MEAL_IMAGES_BUCKET = 'meal-images';

function validateImageFile(file: File): string | null {
  if (!(ATTACHMENT_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return 'JPG, PNG, WebP, GIF 이미지만 업로드할 수 있습니다.';
  }
  if (file.size > ATTACHMENT_IMAGE_MAX_BYTES) {
    return '이미지 크기는 50MB 이하여야 합니다.';
  }
  return null;
}

export async function uploadMealProductImage(
  productId: string,
  formData: FormData,
): Promise<{ data?: { url: string }; error?: string }> {
  const file = formData.get('file') as File | null;
  if (!file) return { error: '파일을 선택해 주세요.' };
  const v = validateImageFile(file);
  if (v) return { error: v };

  const up = await uploadToBucketAsUser({
    bucket: MEAL_IMAGES_BUCKET,
    pathWithinUser: `products/${productId}/${Date.now()}_${sanitizeAttachmentSegment(file.name)}`,
    file,
    contentType: file.type || 'image/jpeg',
  });
  if (!up.ok) return { error: up.error };

  const rec = await recordMealProductImage(productId, { url: up.url });
  if (rec.error) {
    // 기록 실패 시 방금 올린 객체 정리(orphan 방지).
    await deleteStorageObjectAsUser(MEAL_IMAGES_BUCKET, up.path);
    return { error: rec.error };
  }
  return rec;
}

export async function uploadMealMenuImage(
  productId: string,
  menuId: string,
  formData: FormData,
): Promise<{ data?: { url: string }; error?: string }> {
  const file = formData.get('file') as File | null;
  if (!file) return { error: '파일을 선택해 주세요.' };
  const v = validateImageFile(file);
  if (v) return { error: v };

  const up = await uploadToBucketAsUser({
    bucket: MEAL_IMAGES_BUCKET,
    pathWithinUser: `menus/${menuId}/${Date.now()}_${sanitizeAttachmentSegment(file.name)}`,
    file,
    contentType: file.type || 'image/jpeg',
  });
  if (!up.ok) return { error: up.error };

  const rec = await recordMealMenuImage(productId, menuId, { url: up.url });
  if (rec.error) {
    await deleteStorageObjectAsUser(MEAL_IMAGES_BUCKET, up.path);
    return { error: rec.error };
  }
  return rec;
}
