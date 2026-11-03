import type { Metadata } from 'next';
import { ApiConsole } from './api-console';

export const metadata: Metadata = {
  title: '외부 연동 API 안내 - 루트스터디',
};

// 외부 연동 API(/api/external/v1/*) 업체용 안내 + 호출 테스트.
// 로그인 없이 열리는 공개 페이지(미들웨어 alwaysPublicPaths). 보안은 인증키가 담당하므로
// 안내 내용 공개 자체는 문제없다. 원본 안내서: .00_buildersgate/client/외부연동API_연동안내서.md

const BASE = 'https://app.routestudy.co.kr/api/external/v1';

const TH = 'border border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold';
const TD = 'border border-gray-200 px-3 py-2 align-top';
const CODE = 'rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[13px] break-all';
const PRE =
  'overflow-x-auto rounded-lg bg-gray-900 p-4 font-mono text-[13px] leading-relaxed text-gray-100';

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className='overflow-x-auto'>
      <table className='w-full border-collapse text-sm'>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className={TH}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? `${TD} whitespace-nowrap` : TD}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className='scroll-mt-6 space-y-3'>
      <h2 className='text-lg font-semibold'>{title}</h2>
      {children}
    </section>
  );
}

export default function DevelopersPage() {
  return (
    <main className='text-text mx-auto max-w-3xl px-6 py-12'>
      <p className='text-primary mb-1 text-sm font-semibold'>루트스터디 외부 연동 API v1</p>
      <h1 className='mb-2 text-2xl font-bold'>연동 안내</h1>
      <p className='text-text-muted mb-8 text-sm leading-relaxed'>
        사이니지 등 외부 업체가 루트스터디 앱의 학생 순위 데이터를 조회하기 위한 안내입니다. 조회
        전용이며, 발급받은 인증키의 지점(센터) 학생 정보만 응답합니다. 인증키가 있으면 이 페이지
        아래쪽에서 바로 호출해 볼 수 있습니다.
      </p>

      <nav className='mb-10 flex flex-wrap gap-2 text-sm'>
        {[
          ['#basics', '기본 정보'],
          ['#auth', '인증'],
          ['#endpoints', '조회 기능'],
          ['#fields', '응답 항목'],
          ['#errors', '오류'],
          ['#example', '사용 예'],
          ['#try', '호출 테스트'],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className='rounded-full border border-gray-200 px-3 py-1 hover:bg-gray-50'
          >
            {label}
          </a>
        ))}
      </nav>

      <div className='space-y-12 text-sm leading-relaxed'>
        <Section id='basics' title='1. 기본 정보'>
          <Table
            head={['항목', '내용']}
            rows={[
              [
                '기본 주소',
                <code key='b' className={CODE}>
                  {BASE}
                </code>,
              ],
              ['방식', 'GET (조회 전용)'],
              ['응답 형식', 'JSON (UTF-8)'],
              ['인증', '발급받은 인증키를 요청 헤더에 넣습니다 (아래 2번)'],
              ['호출 한도', '인증키 1개당 분당 60회'],
              ['권장 갱신 주기', '1~5분 간격'],
            ]}
          />
        </Section>

        <Section id='auth' title='2. 인증'>
          <p>요청 헤더에 아래 둘 중 하나로 인증키를 넣어 주세요.</p>
          <pre className={PRE}>{`Authorization: Bearer rsk_xxxxxxxxxxxxxxxx
X-API-Key: rsk_xxxxxxxxxxxxxxxx`}</pre>
          <ul className='list-disc space-y-1 pl-5'>
            <li>인증키는 지점(센터)별로 발급되며, 응답에는 해당 지점 재원생만 포함됩니다.</li>
            <li>
              인증키는 서버나 사이니지 기기 설정에만 보관해 주세요. 웹페이지 소스처럼 누구나 볼 수
              있는 곳에 넣으면 안 됩니다.
            </li>
            <li>
              분실하거나 유출되면 루트스터디에 알려 주세요. 즉시 폐기하고 새 키를 발급해 드립니다.
            </li>
          </ul>
        </Section>

        <Section id='endpoints' title='3. 조회 기능'>
          <h3 className='font-semibold'>3-1. 학생 명단 — GET /students</h3>
          <pre className={PRE}>{`{
  "data": [
    { "id": "04ac14f9-...", "name": "박○준", "grade": "고3", "seat_number": 1 }
  ],
  "meta": { "generated_at": "2026-11-01T04:34:23.972Z", "count": 152 }
}`}</pre>

          <h3 className='pt-4 font-semibold'>3-2. 누적 획득 상점 — GET /points</h3>
          <pre className={PRE}>{`{
  "data": [
    { "id": "3c7b9747-...", "name": "류○서", "grade": "고3", "seat_number": 58,
      "earned_total": 101, "balance": 101 }
  ],
  "meta": { "generated_at": "2026-11-01T04:35:36.209Z", "count": 122 }
}`}</pre>
          <ul className='list-disc space-y-1 pl-5'>
            <li>
              <code className={CODE}>earned_total</code>: 누적 획득 상점. 상품권으로 교환해 사용한
              점수까지 포함한 총 획득 점수입니다. 누적 상점 순위에는 이 값을 쓰면 됩니다.
            </li>
            <li>
              <code className={CODE}>balance</code>: 현재 남아 있는 상점입니다. (참고용)
            </li>
            <li>결과는 earned_total 이 높은 순으로 정렬되어 있습니다.</li>
          </ul>

          <h3 className='pt-4 font-semibold'>3-3. 순공시간 — GET /study-time</h3>
          <pre className={PRE}>{`GET ${BASE}/study-time
GET ${BASE}/study-time?from=2026-10-26&to=2026-11-01

{
  "data": [
    { "id": "67ccae80-...", "name": "김○민", "grade": "N수생", "seat_number": 12,
      "study_seconds": 280560, "study_minutes": 4676 }
  ],
  "meta": { "generated_at": "...", "count": 26, "from": "2026-10-26", "to": "2026-11-01" }
}`}</pre>
          <Table
            head={['파라미터', '설명']}
            rows={[
              [
                <code key='f' className={CODE}>
                  from, to
                </code>,
                '조회 기간 (YYYY-MM-DD, 최대 31일). 생략하면 이번 주 월요일 ~ 오늘이므로 주간 순위에 그대로 쓰면 됩니다.',
              ],
            ]}
          />
          <ul className='list-disc space-y-1 pl-5'>
            <li>
              날짜는 학습일 기준입니다. 학습일은 오전 6시 ~ 다음 날 새벽 3시이며, 앱의
              출석부·리포트와 같은 계산입니다. (예: 화요일 새벽 1시까지 공부한 시간은 월요일
              순공시간에 들어갑니다.)
            </li>
            <li>
              지금 입실 중인 학생은 현재 시각까지의 시간이 포함되어, 호출할 때마다 값이 늘어납니다.
            </li>
            <li>주간 순위는 매주 월요일 오전 6시에 새 주로 바뀝니다.</li>
            <li>결과는 study_seconds 가 높은 순으로 정렬되어 있습니다.</li>
          </ul>

          <h3 className='pt-4 font-semibold'>3-4. 공통 — 학년 필터</h3>
          <p>
            세 기능 모두 <code className={CODE}>grade</code> 파라미터로 학년을 거를 수 있습니다.
            쉼표로 여러 개를 지정할 수 있습니다. (예: <code className={CODE}>?grade=고3,고2</code>)
          </p>
          <p>
            학년 값: N수생, 고3, 고2, 고1, 중3, 중2, 중1 — 한글이므로 URL 인코딩해서 보내 주세요.
            (예: <code className={CODE}>grade=%EA%B3%A03</code> = 고3)
          </p>
        </Section>

        <Section id='fields' title='4. 응답 항목'>
          <Table
            head={['항목', '설명']}
            rows={[
              [
                'id',
                '학생 고유 ID. 바뀌지 않으므로 세 기능의 결과를 합칠 때 이 값을 기준으로 쓰세요.',
              ],
              [
                'name',
                '학생 이름. 지점 설정에 따라 실명 또는 가운데를 가린 형태(예: 홍○동)로 제공됩니다.',
              ],
              ['grade', '학년(학생 유형). 미지정이면 null.'],
              ['seat_number', '좌석 번호. 미지정이면 null.'],
              ['meta.generated_at', '응답 생성 시각 (UTC, ISO 8601)'],
              ['meta.count', '결과 학생 수'],
            ]}
          />
          <p className='text-text-muted'>
            퇴원 처리된 학생과 가입 승인 전 학생은 결과에 포함되지 않습니다.
          </p>
        </Section>

        <Section id='errors' title='5. 오류'>
          <pre
            className={PRE}
          >{`{ "error": { "code": "invalid_api_key", "message": "유효하지 않거나 폐기된 인증키입니다." } }`}</pre>
          <Table
            head={['상태', 'code', '의미 / 조치']}
            rows={[
              ['401', 'missing_api_key', '인증키가 없습니다. 헤더를 확인해 주세요.'],
              [
                '401',
                'invalid_api_key',
                '잘못되었거나 폐기된 인증키입니다. 루트스터디에 문의해 주세요.',
              ],
              [
                '400',
                'invalid_date / invalid_range / range_too_long',
                'from·to 형식(YYYY-MM-DD), 순서, 기간(최대 31일)을 확인해 주세요.',
              ],
              [
                '429',
                'rate_limited',
                '분당 호출 한도를 넘었습니다. Retry-After 헤더의 초만큼 기다린 뒤 다시 호출해 주세요.',
              ],
              [
                '500',
                'internal_error',
                '일시적인 서버 오류입니다. 잠시 후 다시 시도해 주세요. 직전 화면을 유지하는 것을 권장합니다.',
              ],
            ]}
          />
          <p>모든 정상 응답에는 호출 한도 헤더가 붙습니다.</p>
          <Table
            head={['헤더', '의미']}
            rows={[
              ['X-RateLimit-Limit', '분당 최대 호출 수'],
              ['X-RateLimit-Remaining', '이번 1분 안에 남은 호출 수'],
              ['X-RateLimit-Reset', '한도가 초기화되기까지 남은 초'],
            ]}
          />
        </Section>

        <Section id='example' title='6. 권장 사용 예 (40인치 사이니지)'>
          <p>1~5분마다 아래 4번만 호출하면 요청하신 화면을 모두 만들 수 있습니다.</p>
          <Table
            head={['화면', '호출']}
            rows={[
              ['누적 상점 순위', 'GET /points'],
              ['N수생 주간 순공 순위', 'GET /study-time?grade=N수생'],
              ['고3 주간 순공 순위', 'GET /study-time?grade=고3'],
              ['고2 주간 순공 순위', 'GET /study-time?grade=고2'],
            ]}
          />
          <pre className={PRE}>{`curl -H "X-API-Key: rsk_발급받은키" \\
  "${BASE}/study-time?grade=%EA%B3%A03"`}</pre>
        </Section>

        <Section id='try' title='7. 호출 테스트'>
          <p className='text-text-muted'>
            입력한 인증키는 이 브라우저 창에서 호출할 때만 쓰이고 어디에도 저장되지 않습니다. 테스트
            호출도 분당 호출 한도에 포함됩니다.
          </p>
          <ApiConsole />
        </Section>

        <p className='text-text-muted border-t border-gray-200 pt-6'>
          연동 중 문의와 인증키 재발급은 루트스터디 담당자를 통해 요청해 주세요.
        </p>
      </div>
    </main>
  );
}
