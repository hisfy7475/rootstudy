// URL searchParams 표준 파싱 + ilike 이스케이프 + href 빌더.
// 어드민 목록 페이지 공통 모듈. 잘못된 값은 throw 하지 않고 default 로 클램핑한다.

export type SortDir = 'asc' | 'desc';

export interface ListParamsConfig<S extends string, F extends string> {
  /** 정렬 기본 컬럼 */
  defaultSort: S;
  /** 기본 방향. 미지정 시 'desc'. */
  defaultDir?: SortDir;
  /** 기본 페이지 크기. 미지정 시 20. */
  defaultPageSize?: number;
  /** 허용된 정렬 컬럼 화이트리스트. */
  sortAllowlist: readonly S[];
  /** 허용된 필터 키 화이트리스트 (URL 키와 동일). */
  filterAllowlist: readonly F[];
  /** 허용된 page size 선택지. 미지정 시 [20, 50, 100]. */
  pageSizeChoices?: readonly number[];
}

export interface ListParams<S extends string, F extends string> {
  page: number; // 1-based
  pageSize: number;
  q: string;
  sort: S;
  dir: SortDir;
  filters: Partial<Record<F, string>>;
}

export interface PaginatedResult<T> {
  rows: T[];
  total: number;
  /** 서버에서 clamp 한 실제 페이지. requested 와 다를 수 있음. */
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE_CHOICES = [20, 50, 100] as const;

function pickFirst(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export function parseListParams<S extends string, F extends string>(
  raw: Record<string, string | string[] | undefined>,
  cfg: ListParamsConfig<S, F>,
): ListParams<S, F> {
  const defaultDir: SortDir = cfg.defaultDir ?? 'desc';
  const defaultPageSize = cfg.defaultPageSize ?? 20;
  const pageSizeChoices = cfg.pageSizeChoices ?? DEFAULT_PAGE_SIZE_CHOICES;

  const pageRaw = pickFirst(raw.page);
  const sizeRaw = pickFirst(raw.size);
  const qRaw = pickFirst(raw.q);
  const sortRaw = pickFirst(raw.sort);
  const dirRaw = pickFirst(raw.dir);

  const pageNum = Number.parseInt(pageRaw ?? '1', 10);
  const page = Number.isFinite(pageNum) ? Math.max(1, pageNum) : 1;

  const sizeNum = Number.parseInt(sizeRaw ?? `${defaultPageSize}`, 10);
  const pageSize = pageSizeChoices.includes(sizeNum) ? sizeNum : defaultPageSize;

  const sort = (cfg.sortAllowlist as readonly string[]).includes(sortRaw ?? '')
    ? (sortRaw as S)
    : cfg.defaultSort;
  const dir: SortDir = dirRaw === 'asc' || dirRaw === 'desc' ? dirRaw : defaultDir;
  const q = (qRaw ?? '').trim();

  const filters: Partial<Record<F, string>> = {};
  for (const key of cfg.filterAllowlist) {
    const v = pickFirst(raw[key]);
    if (v && v.trim()) filters[key] = v.trim();
  }

  return { page, pageSize, q, sort, dir, filters };
}

/**
 * 현재 URLSearchParams 를 복제한 뒤 patch 를 적용한 절대 경로를 만든다.
 * - value 가 null / undefined / '' 이면 키 제거
 * - 그 외에는 String() 으로 직렬화 후 set
 */
export function buildListHref(
  pathname: string,
  current: URLSearchParams,
  patch: Record<string, string | number | null | undefined>,
): string {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === '') {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
  }
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/**
 * PostgREST `ilike` 패턴에서 `%`, `_`, `\` 는 와일드카드 / escape 문자다.
 * 사용자 검색어를 리터럴로 매칭시키려면 모두 escape 해야 한다.
 */
export function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, '\\$&');
}
