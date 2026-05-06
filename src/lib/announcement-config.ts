// 공지사항 첨부파일 정책 (서버/클라이언트 공유)
// 서버 액션 파일(`announcement.ts`)이 'use server'라 const export가 불가능하기 때문에 별도 모듈로 분리한다.

export const ANNOUNCEMENT_FILE_MAX_BYTES = 20 * 1024 * 1024; // 20MB
export const ANNOUNCEMENT_FILE_MAX_COUNT = 15;

export const ANNOUNCEMENT_ALLOWED_MIME = [
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
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export type AnnouncementAllowedMime = (typeof ANNOUNCEMENT_ALLOWED_MIME)[number];

// 파일 input의 accept 속성용 (브라우저 단계 1차 필터)
export const ANNOUNCEMENT_FILE_ACCEPT = ANNOUNCEMENT_ALLOWED_MIME.join(',');

export function isAnnouncementMimeAllowed(mime: string): boolean {
  return ANNOUNCEMENT_ALLOWED_MIME.includes(mime as AnnouncementAllowedMime);
}
