import { createClient } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../constants';
import type { StoredSession } from '../hooks/useSecureTokenStore';
import {
  ATTACHMENT_FILE_MAX_BYTES,
  ATTACHMENT_IMAGE_MAX_BYTES,
  resolveAttachmentFileMime,
  sanitizeAttachmentSegment,
} from '@shared/uploads/attachments';
import { FILE_SIZE_10MB } from '@shared/uploads/file-utils';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

function createAuthedClient(session: StoredSession) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase URL/anon key가 설정되지 않았습니다. studycafe-app/.env 를 확인하세요.');
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    },
  });
}

/**
 * React Native FormData를 사용하여 file:// URI를 Supabase Storage에 직접 업로드.
 * RN의 fetch polyfill은 file:// URI의 arrayBuffer()/blob()을 지원하지 않으므로
 * FormData에 { uri, name, type } 객체를 넘겨 네이티브 레이어에서 파일을 읽도록 함.
 */
async function uploadToStorage(
  bucket: string,
  storagePath: string,
  fileUri: string,
  fileName: string,
  mimeType: string,
  accessToken: string
): Promise<void> {
  const formData = new FormData();
  formData.append('', {
    uri: fileUri,
    name: fileName,
    type: mimeType,
  } as unknown as Blob);

  const res = await fetch(
    `${SUPABASE_URL}/storage/v1/object/${bucket}/${storagePath}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        'x-upsert': 'false',
      },
      body: formData,
    }
  );

  if (!res.ok) {
    const body = await res.text();
    console.error('[nativeChatUpload] storage upload failed:', res.status, body);
    throw new Error('파일 업로드에 실패했습니다.');
  }
}

export type NativeUploadOk = { url: string; filename: string; mime_type: string };

export async function uploadChatImageFromNative(
  session: StoredSession,
  roomId: string,
  uri: string,
  mimeType: string | undefined,
  size: number | undefined
): Promise<NativeUploadOk> {
  const mt = mimeType?.trim() || 'image/jpeg';
  if (!ALLOWED_IMAGE_TYPES.has(mt)) {
    throw new Error('지원하지 않는 이미지 형식입니다.');
  }
  if (size != null && size > FILE_SIZE_10MB) {
    throw new Error('이미지 크기는 10MB 이하여야 합니다.');
  }

  const supabase = createAuthedClient(session);
  const { data: userData, error: userErr } = await supabase.auth.getUser(session.access_token);
  if (userErr || !userData.user) {
    throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
  }

  const ext =
    mt === 'image/png'
      ? 'png'
      : mt === 'image/gif'
        ? 'gif'
        : mt === 'image/webp'
          ? 'webp'
          : 'jpg';
  const fileName = `${Date.now()}.${ext}`;
  const storagePath = `${userData.user.id}/${roomId}/${fileName}`;

  await uploadToStorage(
    'chat-images',
    storagePath,
    uri,
    fileName,
    mt,
    session.access_token,
  );

  // 이미지는 인라인 미리보기 유지를 위해 download 옵션 미적용.
  const { data: pub } = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    .storage.from('chat-images')
    .getPublicUrl(storagePath);

  return { url: pub.publicUrl, filename: `image.${ext}`, mime_type: mt };
}

export async function uploadChatFileFromNative(
  session: StoredSession,
  roomId: string,
  uri: string,
  filename: string,
  mimeType: string | undefined,
  size: number | undefined | null
): Promise<NativeUploadOk> {
  // 위장 이미지 차단은 MIME 결정 이전.
  if (mimeType && mimeType.trim().toLowerCase().startsWith('image/')) {
    throw new Error('이미지는 이미지 첨부를 사용해 주세요.');
  }
  // 확장자 우선으로 MIME 결정. DocumentPicker가 mimeType undefined/octet-stream을
  // 주는 Android 케이스에서도 확장자가 화이트리스트면 통과.
  const resolvedMime = resolveAttachmentFileMime(mimeType, filename);
  if (!resolvedMime) {
    throw new Error('지원하지 않는 파일 형식입니다.');
  }
  if (size != null && size > ATTACHMENT_FILE_MAX_BYTES) {
    throw new Error('파일 크기는 20MB 이하여야 합니다.');
  }

  const supabase = createAuthedClient(session);
  const { data: userData, error: userErr } = await supabase.auth.getUser(session.access_token);
  if (userErr || !userData.user) {
    throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
  }

  const safeBase = sanitizeAttachmentSegment(filename || 'file');
  const storagePath = `${userData.user.id}/${roomId}/${Date.now()}_${safeBase}`;

  await uploadToStorage(
    'chat-files',
    storagePath,
    uri,
    safeBase,
    resolvedMime,
    session.access_token,
  );

  // 다운로드 시 원본 한글 파일명이 보존되도록 ?download=<원본이름> 강제.
  const downloadName = filename || safeBase;
  const { data: pub } = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    .storage.from('chat-files')
    .getPublicUrl(storagePath, { download: downloadName });

  return { url: pub.publicUrl, filename: downloadName, mime_type: resolvedMime };
}

// ─── 멘토링/클리닉/상담 신청 첨부 ────────────────────────────────
// 채팅 함수의 형태를 그대로 따르되 버킷·경로 prefix만 다르다.
// 서버 액션 sanitizeAttachmentList 가 `${uid}/applications/...` prefix 를 기대하므로 동일하게 맞춘다.

export async function uploadMentoringImageFromNative(
  session: StoredSession,
  uri: string,
  mimeType: string | undefined,
  size: number | undefined,
): Promise<NativeUploadOk> {
  const mt = mimeType?.trim() || 'image/jpeg';
  if (!ALLOWED_IMAGE_TYPES.has(mt)) {
    throw new Error('지원하지 않는 이미지 형식입니다.');
  }
  if (size != null && size > ATTACHMENT_IMAGE_MAX_BYTES) {
    throw new Error('이미지 크기는 10MB 이하여야 합니다.');
  }

  const supabase = createAuthedClient(session);
  const { data: userData, error: userErr } = await supabase.auth.getUser(session.access_token);
  if (userErr || !userData.user) {
    throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
  }

  const ext =
    mt === 'image/png'
      ? 'png'
      : mt === 'image/gif'
        ? 'gif'
        : mt === 'image/webp'
          ? 'webp'
          : 'jpg';
  const fileName = `${Date.now()}.${ext}`;
  const storagePath = `${userData.user.id}/applications/${fileName}`;

  await uploadToStorage(
    'mentoring-attachments',
    storagePath,
    uri,
    fileName,
    mt,
    session.access_token,
  );

  // 이미지는 인라인 미리보기 유지를 위해 download 옵션 미적용.
  const { data: pub } = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    .storage.from('mentoring-attachments')
    .getPublicUrl(storagePath);

  return { url: pub.publicUrl, filename: `image.${ext}`, mime_type: mt };
}

export async function uploadMentoringFileFromNative(
  session: StoredSession,
  uri: string,
  filename: string,
  mimeType: string | undefined,
  size: number | undefined | null,
): Promise<NativeUploadOk> {
  if (mimeType && mimeType.trim().toLowerCase().startsWith('image/')) {
    throw new Error('이미지는 이미지 첨부를 사용해 주세요.');
  }
  const resolvedMime = resolveAttachmentFileMime(mimeType, filename);
  if (!resolvedMime) {
    throw new Error('지원하지 않는 파일 형식입니다.');
  }
  if (size != null && size > ATTACHMENT_FILE_MAX_BYTES) {
    throw new Error('파일 크기는 20MB 이하여야 합니다.');
  }

  const supabase = createAuthedClient(session);
  const { data: userData, error: userErr } = await supabase.auth.getUser(session.access_token);
  if (userErr || !userData.user) {
    throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
  }

  const safeBase = sanitizeAttachmentSegment(filename || 'file');
  const storagePath = `${userData.user.id}/applications/${Date.now()}_${safeBase}`;

  await uploadToStorage(
    'mentoring-files',
    storagePath,
    uri,
    safeBase,
    resolvedMime,
    session.access_token,
  );

  const downloadName = filename || safeBase;
  const { data: pub } = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    .storage.from('mentoring-files')
    .getPublicUrl(storagePath, { download: downloadName });

  return { url: pub.publicUrl, filename: downloadName, mime_type: resolvedMime };
}
