import {
  FILE_SIZE_20MB,
  resolveMimeFromTable,
  sanitizeStorageSegment,
  type ExtMimeTable,
} from './file-utils';

export const CHAT_FILE_MAX_BYTES = FILE_SIZE_20MB;

export const CHAT_FILE_EXT_TO_MIME: ExtMimeTable = {
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
export const CHAT_FILE_ACCEPT = [
  ...Object.keys(CHAT_FILE_EXT_TO_MIME).map((e) => `.${e}`),
  ...Object.values(CHAT_FILE_EXT_TO_MIME),
].join(',');

export function resolveChatFileMime(
  mimeType: string | null | undefined,
  filename: string,
): string | null {
  return resolveMimeFromTable(CHAT_FILE_EXT_TO_MIME, mimeType, filename);
}

export { sanitizeStorageSegment as sanitizeChatFileSegment };
