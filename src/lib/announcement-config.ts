// 공지사항 첨부파일 정책 (서버/클라이언트 공유)
// 서버 액션 파일(`announcement.ts`)이 'use server'라 const export가 불가능하기 때문에 별도 모듈로 분리한다.

import {
  FILE_SIZE_20MB,
  resolveMimeFromTable,
  sanitizeStorageSegment,
  type ExtMimeTable,
} from '@shared/uploads/file-utils';

export const ANNOUNCEMENT_FILE_MAX_BYTES = FILE_SIZE_20MB;
export const ANNOUNCEMENT_FILE_MAX_COUNT = 15;

// 공지는 이미지도 첨부 가능 — 채팅과 다름.
export const ANNOUNCEMENT_FILE_EXT_TO_MIME: ExtMimeTable = {
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
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

export const ANNOUNCEMENT_FILE_ACCEPT = [
  ...Object.keys(ANNOUNCEMENT_FILE_EXT_TO_MIME).map((e) => `.${e}`),
  ...Object.values(ANNOUNCEMENT_FILE_EXT_TO_MIME),
].join(',');

export function resolveAnnouncementFileMime(
  mimeType: string | null | undefined,
  filename: string,
): string | null {
  return resolveMimeFromTable(ANNOUNCEMENT_FILE_EXT_TO_MIME, mimeType, filename);
}

export { sanitizeStorageSegment as sanitizeAnnouncementFileSegment };
