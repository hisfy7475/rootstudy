import { createClient } from '@supabase/supabase-js';

import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../constants';
import type { StoredSession } from '../hooks/useSecureTokenStore';

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

const CHAT_FILE_ALLOWED_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
]);

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

function sanitizeChatFileSegment(name: string): string {
  const base = name.replace(/[/\\]/g, '_').replace(/\s+/g, '_');
  return base.slice(0, 200) || 'file';
}

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

async function uriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const res = await fetch(uri);
  if (!res.ok) {
    throw new Error('파일을 읽을 수 없습니다.');
  }
  return res.arrayBuffer();
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
  if (size != null && size > MAX_IMAGE_BYTES) {
    throw new Error('이미지 크기는 10MB 이하여야 합니다.');
  }

  const supabase = createAuthedClient(session);
  const { data: userData, error: userErr } = await supabase.auth.getUser();
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
  const path = `${userData.user.id}/${roomId}/${Date.now()}.${ext}`;
  const body = await uriToArrayBuffer(uri);

  const { data, error } = await supabase.storage
    .from('chat-images')
    .upload(path, body, {
      cacheControl: '3600',
      upsert: false,
      contentType: mt,
    });

  if (error) {
    console.error('[nativeChatUpload] chat-images', error);
    throw new Error('이미지 업로드에 실패했습니다.');
  }

  const { data: pub } = supabase.storage.from('chat-images').getPublicUrl(data.path);
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
  const mt = mimeType?.trim() || 'application/octet-stream';
  if (mt.startsWith('image/')) {
    throw new Error('이미지는 이미지 첨부를 사용해 주세요.');
  }
  if (!CHAT_FILE_ALLOWED_TYPES.has(mt)) {
    throw new Error('지원하지 않는 파일 형식입니다.');
  }
  if (size != null && size > MAX_FILE_BYTES) {
    throw new Error('파일 크기는 20MB 이하여야 합니다.');
  }

  const supabase = createAuthedClient(session);
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    throw new Error('로그인 세션이 만료되었습니다. 다시 로그인해 주세요.');
  }

  const safeBase = sanitizeChatFileSegment(filename || 'file');
  const path = `${userData.user.id}/${roomId}/${Date.now()}_${safeBase}`;
  const body = await uriToArrayBuffer(uri);

  const { data, error } = await supabase.storage
    .from('chat-files')
    .upload(path, body, {
      cacheControl: '3600',
      upsert: false,
      contentType: mt || undefined,
    });

  if (error) {
    console.error('[nativeChatUpload] chat-files', error);
    throw new Error('파일 업로드에 실패했습니다.');
  }

  const { data: pub } = supabase.storage.from('chat-files').getPublicUrl(data.path);
  return { url: pub.publicUrl, filename: filename || safeBase, mime_type: mt };
}
