import 'server-only';
import { createHash, randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';

/**
 * 외부 연동 API(/api/external/v1/*) 공용 — 인증키 검증·호출 제한·학생 명단·응답 형식.
 *
 * 2026-10-28 사이니지 연동 요청으로 신설. 외부 업체는 지점(센터) 단위로 발급된 키로만
 * 접근하고, 응답은 항상 그 지점 재원생으로 한정된다. 키 원문은 DB 에 없다(sha256 해시만).
 * 테이블·RPC: supabase/migrations/20261101120000_external_api_keys.sql
 */

export type NameDisplay = 'full' | 'masked';

export type ExternalApiContext = {
  keyId: string;
  branchId: string;
  nameDisplay: NameDisplay;
};

const KEY_PREFIX = 'rsk_';

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** 새 키 원문 + 저장용 해시·앞자리. 원문은 발급 화면에서 1회만 보여 준다. */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = KEY_PREFIX + randomBytes(24).toString('base64url');
  return { key, hash: hashApiKey(key), prefix: key.slice(0, KEY_PREFIX.length + 6) };
}

/**
 * 외부 업체에 넘길 이름. masked 는 가운데 글자를 가린다.
 * 홍길동 → 홍*동, 김민 → 김*, 남궁민수 → 남**수
 *
 * 운영 이름에는 `홍길동(N)`·`홍길동74`·`홍길동 실장님` 처럼 센터가 붙인 꼬리가 있다(2026-11 기준 약 20%).
 * 그대로 가리면 `홍****)` 가 되므로, masked 는 앞쪽 한글 이름만 남겨 가린다(꼬리는 학년과 중복이거나 식별 단서).
 */
export function displayName(name: string, mode: NameDisplay): string {
  const n = name.trim();
  if (mode === 'full') return n;
  const chars = [...(n.match(/^[가-힣]+/)?.[0] ?? n)];
  if (chars.length <= 1) return chars.join('');
  if (chars.length === 2) return `${chars[0]}*`;
  return chars[0] + '*'.repeat(chars.length - 2) + chars[chars.length - 1];
}

function errorJson(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json({ error: { code, message } }, { status, headers });
}

/**
 * 요청 인증 + 호출 수 집계. 통과하면 컨텍스트로 handler 를 실행하고,
 * 응답에 호출 제한 헤더(X-RateLimit-*)를 붙인다.
 *
 * 키는 `Authorization: Bearer <key>` 또는 `X-API-Key: <key>` 로 받는다.
 */
export async function withExternalApi(
  request: Request,
  handler: (ctx: ExternalApiContext) => Promise<Response>,
): Promise<Response> {
  const auth = request.headers.get('authorization');
  const key =
    (auth?.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : null) ||
    request.headers.get('x-api-key')?.trim() ||
    null;
  if (!key) return errorJson(401, 'missing_api_key', '인증키가 없습니다.');

  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc('external_api_authorize', {
    p_key_hash: hashApiKey(key),
  });
  if (error) {
    console.error('[external-api] authorize failed', error);
    return errorJson(500, 'internal_error', '일시적인 오류입니다. 잠시 후 다시 시도해 주세요.');
  }
  const row = (
    data as Array<{
      key_id: string;
      branch_id: string;
      name_display: NameDisplay;
      allowed: boolean;
      request_count: number;
      rate_limit_per_minute: number;
      window_reset_at: string;
    }> | null
  )?.[0];
  if (!row) return errorJson(401, 'invalid_api_key', '유효하지 않거나 폐기된 인증키입니다.');

  const resetSec = Math.max(
    1,
    Math.ceil((new Date(row.window_reset_at).getTime() - Date.now()) / 1000),
  );
  const rateHeaders = {
    'X-RateLimit-Limit': String(row.rate_limit_per_minute),
    'X-RateLimit-Remaining': String(Math.max(0, row.rate_limit_per_minute - row.request_count)),
    'X-RateLimit-Reset': String(resetSec),
  };
  if (!row.allowed) {
    return errorJson(429, 'rate_limited', '호출 한도를 넘었습니다. 잠시 후 다시 시도해 주세요.', {
      ...rateHeaders,
      'Retry-After': String(resetSec),
    });
  }

  let res: Response;
  try {
    res = await handler({
      keyId: row.key_id,
      branchId: row.branch_id,
      nameDisplay: row.name_display,
    });
  } catch (e) {
    if (e instanceof ExternalApiError) return errorJson(e.status, e.code, e.message, rateHeaders);
    console.error('[external-api] handler failed', e);
    return errorJson(
      500,
      'internal_error',
      '일시적인 오류입니다. 잠시 후 다시 시도해 주세요.',
      rateHeaders,
    );
  }
  for (const [k, v] of Object.entries(rateHeaders)) res.headers.set(k, v);
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

/** handler 안에서 던지면 해당 상태코드의 오류 응답으로 바뀐다 (잘못된 파라미터 등). */
export class ExternalApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export type ExternalStudent = {
  id: string;
  name: string;
  grade: string | null;
  seat_number: number | null;
};

/** 지점 재원생(승인·미퇴원). 모든 엔드포인트가 이 명단을 기준으로 응답한다. */
export async function fetchBranchStudents(ctx: ExternalApiContext): Promise<ExternalStudent[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('student_profiles')
    .select(
      `
      id,
      seat_number,
      student_types ( name ),
      profiles!inner ( name, branch_id, user_type, is_approved, withdrawn_at )
    `,
    )
    .eq('profiles.branch_id', ctx.branchId)
    .eq('profiles.user_type', 'student')
    .eq('profiles.is_approved', true)
    .is('profiles.withdrawn_at', null);
  if (error) throw new Error(`fetchBranchStudents: ${error.message}`);

  return (data ?? [])
    .map((s) => {
      const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
      const t = Array.isArray(s.student_types) ? s.student_types[0] : s.student_types;
      return {
        id: s.id as string,
        name: displayName((p?.name as string) ?? '', ctx.nameDisplay),
        grade: (t?.name as string | undefined) ?? null,
        seat_number: (s.seat_number as number | null) ?? null,
      };
    })
    .sort(
      (a, b) => (a.seat_number ?? 1e9) - (b.seat_number ?? 1e9) || a.name.localeCompare(b.name),
    );
}

/** `?grade=고3` 처럼 학생 타입 이름으로 거른다. 쉼표로 여러 개(`?grade=고3,고2`). 없으면 전체. */
export function filterByGrade<T extends { grade: string | null }>(
  rows: T[],
  request: Request,
): T[] {
  const raw = new URL(request.url).searchParams.get('grade');
  if (!raw) return rows;
  const grades = new Set(
    raw
      .split(',')
      .map((g) => g.trim())
      .filter(Boolean),
  );
  return rows.filter((r) => r.grade !== null && grades.has(r.grade));
}

export function okJson(data: unknown, meta: Record<string, unknown> = {}) {
  return NextResponse.json({ data, meta: { generated_at: new Date().toISOString(), ...meta } });
}
