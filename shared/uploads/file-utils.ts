// 웹(Next.js)과 RN(Expo Metro) 양쪽 빌드가 동일 파일을 컴파일한다.
// 'use server'/'use client', Node-only API (fs, path, crypto.createHash 등) 금지.

export type ExtMimeTable = Readonly<Record<string, string>>;

export const FILE_SIZE_10MB = 10 * 1024 * 1024;
export const FILE_SIZE_20MB = 20 * 1024 * 1024;

export function getExt(name: string): string {
  if (!name) return '';
  const i = name.lastIndexOf('.');
  if (i < 0 || i === name.length - 1) return '';
  return name.slice(i + 1).toLowerCase();
}

// 확장자 우선, MIME 화이트리스트 폴백. 둘 다 실패 시 null.
// 이미지 차단(file.type.startsWith('image/'))은 호출자가 사전에 처리.
export function resolveMimeFromTable(
  table: ExtMimeTable,
  mimeType: string | null | undefined,
  filename: string,
): string | null {
  const ext = getExt(filename);
  if (ext && table[ext]) return table[ext];
  const mt = (mimeType ?? '').trim().toLowerCase();
  if (!mt) return null;
  for (const v of Object.values(table)) {
    if (v === mt) return v;
  }
  return null;
}

// Supabase Storage 키 검증기는 ASCII printable 중에서도 일부만 허용한다.
// 대괄호·중괄호·#·% 등은 'Invalid key'로 거부되므로 영숫자 + ._- 만 보존.
// 원본 파일명은 DB 컬럼(file_name)에 보존되어 UI 표시·다운로드 헤더에 사용됨.
export function sanitizeStorageSegment(name: string): string {
  const base = (name ?? '').replace(/[^A-Za-z0-9._-]+/g, '_').replace(/_+/g, '_');
  return base.replace(/^[._]+/, '').slice(0, 200) || 'file';
}
