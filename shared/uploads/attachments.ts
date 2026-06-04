// 웹(Next.js)과 RN(Expo Metro) 양쪽 빌드가 동일 파일을 컴파일한다.
// 'use server'/'use client', Node-only API (fs, path, crypto.createHash 등) 금지.
//
// 채팅/멘토링 등 도메인 공용 첨부 SSOT. 도메인별 정책 차이가 생기기 전까지 한 곳에서 관리한다.

import {
  FILE_SIZE_50MB,
  resolveMimeFromTable,
  sanitizeStorageSegment,
  type ExtMimeTable,
} from './file-utils';

// 웹 직접 업로드 전환과 함께 이미지/파일 첨부 한도를 50MB로 통일.
export const ATTACHMENT_IMAGE_MAX_BYTES = FILE_SIZE_50MB;
export const ATTACHMENT_FILE_MAX_BYTES = FILE_SIZE_50MB;

export const ATTACHMENT_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;

export type AttachmentImageMime = (typeof ATTACHMENT_IMAGE_MIME_TYPES)[number];

export const ATTACHMENT_FILE_EXT_TO_MIME: ExtMimeTable = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
};

// <input accept=...> 와 헬퍼의 단일 진실 원천 (SSOT)
export const ATTACHMENT_FILE_ACCEPT = [
  ...Object.keys(ATTACHMENT_FILE_EXT_TO_MIME).map((e) => `.${e}`),
  ...Object.values(ATTACHMENT_FILE_EXT_TO_MIME),
].join(',');

export function resolveAttachmentFileMime(
  mimeType: string | null | undefined,
  filename: string,
): string | null {
  return resolveMimeFromTable(ATTACHMENT_FILE_EXT_TO_MIME, mimeType, filename);
}

export { sanitizeStorageSegment as sanitizeAttachmentSegment };
