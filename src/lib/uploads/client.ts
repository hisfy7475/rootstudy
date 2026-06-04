// 브라우저에서 Supabase Storage로 직접 업로드하는 공용 헬퍼.
//
// 왜 직접 업로드인가:
//   웹은 그동안 첨부 File을 Next.js 서버 액션(FormData)으로 보냈는데,
//   Vercel 서버 액션 요청 본문 하드캡(~4.5MB)에 막혀 그보다 큰 파일이 서버에
//   도달하기도 전에 거부됐다. 네이티브 앱처럼 브라우저에서 Storage로 직접 올리면
//   이 병목이 사라지고 버킷 file_size_limit(50MB)까지 업로드된다.
//
// 'use client' 전용: createClient()는 브라우저 클라이언트(createBrowserClient)라
//   클라이언트 컴포넌트에서만 import해야 한다. 서버 컴포넌트에서 import 금지.

import { createClient } from '@/lib/supabase/client';

export type DirectUploadParams = {
  /** Storage 버킷 이름 (예: 'chat-images', 'mentoring-files'). */
  bucket: string;
  /**
   * user.id 이후의 경로 조각. 헬퍼가 앞에 `${user.id}/`를 강제로 붙인다.
   * RLS(`foldername[1] = auth.uid()`)와 멘토링 sanitizeAttachmentList의
   * 본인 폴더 검증을 통과시키기 위해, 호출자는 user.id를 직접 넣지 않는다.
   * 예: `${roomId}/${Date.now()}.jpg`, `applications/${Date.now()}_${safe}`
   */
  pathWithinUser: string;
  file: File | Blob;
  /**
   * 업로드 객체의 Content-Type. 반드시 명시할 것.
   * chat-images·mentoring-attachments 버킷은 allowed_mime_types(image 4종)가
   * 걸려 있어, file.type이 비면 octet-stream으로 추론돼 업로드가 거부된다.
   * 호출부에서 파일은 resolveAttachmentFileMime(), 이미지는 file.type || 폴백을 넘긴다.
   */
  contentType?: string;
  /**
   * 지정 시 getPublicUrl({ download })로 Content-Disposition을 강제해
   * 다운로드 시 원본(한글) 파일명을 보존한다. 이미지는 인라인 미리보기를 위해 미지정.
   */
  downloadFileName?: string;
  cacheControl?: string;
};

export type DirectUploadResult =
  | { ok: true; url: string; path: string }
  | { ok: false; error: string };

function toKoreanUploadError(message: string | undefined): string {
  const m = (message ?? '').toLowerCase();
  if (m.includes('exceeded') || m.includes('maximum allowed size') || m.includes('too large')) {
    return '파일 크기가 허용 한도(50MB)를 초과했습니다.';
  }
  if (m.includes('mime') || m.includes('not supported') || m.includes('invalid mime')) {
    return '지원하지 않는 파일 형식입니다.';
  }
  if (m.includes('invalid key')) {
    return '파일명을 인식할 수 없습니다. 파일명을 바꿔 다시 시도해 주세요.';
  }
  if (m.includes('exists') || m.includes('duplicate')) {
    return '이미 업로드된 파일입니다. 다시 시도해 주세요.';
  }
  return '파일 업로드에 실패했습니다.';
}

/**
 * 본인 폴더(`${user.id}/...`)에 직접 업로드하고 public URL을 반환한다.
 * 업로드만 담당하며, 메시지/신청/공지/식사 등 도메인 레코드 기록은 호출부가
 * 반환된 URL을 서버 액션에 넘겨 처리한다.
 */
export async function uploadToBucketAsUser(p: DirectUploadParams): Promise<DirectUploadResult> {
  const supabase = createClient();

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();
  if (userErr || !user) {
    return { ok: false, error: '로그인이 필요합니다. 다시 로그인해 주세요.' };
  }

  const fullPath = `${user.id}/${p.pathWithinUser}`;

  const { data, error } = await supabase.storage.from(p.bucket).upload(fullPath, p.file, {
    cacheControl: p.cacheControl ?? '3600',
    upsert: false,
    contentType: p.contentType ?? (p.file instanceof File ? p.file.type : undefined) ?? undefined,
  });

  if (error || !data) {
    return { ok: false, error: toKoreanUploadError(error?.message) };
  }

  const { data: pub } = supabase.storage
    .from(p.bucket)
    .getPublicUrl(data.path, p.downloadFileName ? { download: p.downloadFileName } : undefined);

  return { ok: true, url: pub.publicUrl, path: data.path };
}

/**
 * 업로드는 성공했으나 후속 레코드 기록이 실패한 경우(orphan) 정리용.
 * best-effort — 실패해도 throw하지 않는다. DELETE RLS는 본인/admin에게 허용된다.
 */
export async function deleteStorageObjectAsUser(bucket: string, path: string): Promise<void> {
  try {
    const supabase = createClient();
    await supabase.storage.from(bucket).remove([path]);
  } catch {
    // best-effort 정리 — 주기적 정리 작업이 보완.
  }
}
