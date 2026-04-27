import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

// supabase-js v2 의 select 타입 추론은 각 Table 에 `Relationships: []` 필드를 요구한다.
// 우리 src/types/database.ts 는 수작업 관리라 Relationships 를 빠뜨려서 그대로 쓰면
// `.from('x').select('a, b').single()` 결과가 never 로 추론된다. 모든 테이블에 추가하는
// 대신 여기서 schema 단위 mapped type 으로 일괄 부여한다.
type WithRelationships<T> = T extends { Row: unknown } ? T & { Relationships: [] } : T;
type EnrichedSchema<S> = S extends { Tables: infer T }
  ? Omit<S, 'Tables'> & {
      Tables: { [K in keyof T]: WithRelationships<T[K]> };
    }
  : S;
type EnrichedDatabase = {
  [K in keyof Database]: EnrichedSchema<Database[K]>;
};

type BrowserClient = ReturnType<typeof createBrowserClient<EnrichedDatabase>>;

// 브라우저 클라이언트는 싱글턴으로 관리한다. 매번 새로 만들면
// 1) Realtime websocket 이 여러 개 열리고
// 2) auth.onAuthStateChange 리스너가 누적된다.
let cachedClient: BrowserClient | null = null;

export function createClient(): BrowserClient {
  if (cachedClient) return cachedClient;

  cachedClient = createBrowserClient<EnrichedDatabase>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        // Realtime 클라이언트가 채널을 구독하거나 재연결할 때마다 호출되어
        // 최신 access_token 을 적용한다.
        //
        // 과거에는 createClient 안에서 getSession().then(setAuth) 를 호출했는데,
        // 컴포넌트의 useEffect 가 mount 시 즉시 .channel(...).subscribe() 를 부르므로
        // setAuth 가 resolve 되기 전에 채널이 anon JWT 로 먼저 등록되었다.
        // realtime.subscription 에 claims_role='anon' 으로 박히면
        // RLS `TO authenticated` 정책이 false 로 평가되어 postgres_changes 이벤트가
        // 영영 도달하지 않는다 (사이드바 채팅 배지 / /admin/chat 갱신 실패의 진짜 원인).
        accessToken: async () => {
          const {
            data: { session },
          } = await cachedClient!.auth.getSession();
          const token = session?.access_token ?? null;
          console.info(
            '[Supabase] realtime.accessToken called →',
            token ? 'authenticated' : 'anon',
          );
          return token;
        },
      },
    },
  );

  return cachedClient;
}
