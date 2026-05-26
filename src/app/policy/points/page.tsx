import { Card } from '@/components/ui/card';
import { PENALTY_RULES, REWARD_RULES } from '@/lib/constants';

export const metadata = {
  title: '상벌점·몰입도 정책 안내',
};

export default function PointsPolicyPage() {
  return (
    <div className='mx-auto max-w-2xl space-y-6 p-6'>
      <header className='space-y-2'>
        <h1 className='text-text text-2xl font-bold'>상벌점·몰입도 정책</h1>
        <p className='text-text-muted text-sm'>
          학생의 학습 습관과 학원 운영을 위해 다음 정책이 적용됩니다.
        </p>
      </header>

      <Card className='space-y-3 p-4'>
        <h2 className='text-text text-base font-bold'>① 벌점 분기별 운영</h2>
        <p className='text-text-muted text-sm'>
          벌점은 분기 단위(3·6·9·12월 1일 시작)로 누적되며, 새 분기가 시작되면 화면에 표시되는 누적
          벌점은 0으로 초기화됩니다. 누적 이력 자체는 보존되어 관리자가 조회할 수 있습니다.
        </p>
      </Card>

      <Card className='space-y-3 p-4'>
        <h2 className='text-text text-base font-bold'>② 벌점 단계별 경고</h2>
        <ul className='text-text-muted space-y-1.5 text-sm'>
          <li>· {PENALTY_RULES.warn10}점 도달 — 관심 안내 (인앱)</li>
          <li>· {PENALTY_RULES.warn20}점 도달 — 주의 (인앱)</li>
          <li>· {PENALTY_RULES.warn25}점 도달 — 경고 (인앱 + 학부모 알림톡)</li>
          <li className='font-medium text-red-600'>
            · {PENALTY_RULES.withdrawAt}점 도달 — 퇴원 검토 진입 + 보유 상점 소멸
          </li>
        </ul>
      </Card>

      <Card className='space-y-3 border-red-200 bg-red-50/50 p-4'>
        <h2 className='text-base font-bold text-red-700'>③ 30점 도달 시 보유 상점 소멸</h2>
        <p className='text-text text-sm'>
          분기 누적 벌점이 30점에 도달하면 보유한 상점이 모두 소멸됩니다. 단, 100점 단위로 모인
          상점은 자동으로 상품권 발급 대기에 등록되어 보호됩니다.
        </p>
        <p className='text-text-muted text-xs'>
          예: 보유 상점 250점 + 30점 도달 → 100점 × 2건은 상품권 발급 대기로 보호, 잔여 50점은 소멸.
        </p>
      </Card>

      <Card className='space-y-3 p-4'>
        <h2 className='text-text text-base font-bold'>④ 상품권 발급 ({REWARD_RULES.redeemAt}점)</h2>
        <p className='text-text-muted text-sm'>
          상점 {REWARD_RULES.redeemAt}점이 모이면 학생이 직접 신청할 수 있으며, 관리자가 발급합니다.
          {REWARD_RULES.redeemAt}점만 차감되고 잔여 상점은 그대로 보존됩니다.
        </p>
      </Card>

      <Card className='space-y-3 p-4'>
        <h2 className='text-text text-base font-bold'>⑤ 신규생 적응 기간 면제</h2>
        <p className='text-text-muted text-sm'>
          첫 등원일이 정산 대상 주(직전주) 안에 있는 학생은 그 주의 최소시간 미달 벌점이 면제됩니다.
        </p>
      </Card>

      <Card className='space-y-3 p-4'>
        <h2 className='text-text text-base font-bold'>⑥ 일일 자동 상점</h2>
        <p className='text-text-muted text-sm'>
          학습일에 다음 조건을 모두 만족하면 자동으로 상점 {REWARD_RULES.dailyFocusAmount}점을
          획득합니다.
        </p>
        <ul className='text-text-muted space-y-1 text-sm'>
          <li>· 순공시간 ≥ {REWARD_RULES.dailyFocusHours}시간</li>
          <li>· 입실 중 과목 미선택 시간 ≤ {REWARD_RULES.dailyFocusUnclassifiedGraceMinutes}분</li>
          <li>· 월~금 (주말 미부여)</li>
        </ul>
        <p className='text-text-muted text-xs'>결과는 다음날 새벽에 자동 정산됩니다.</p>
      </Card>

      <section className='space-y-3 pt-2'>
        <h2 className='text-text text-base font-bold'>자주 묻는 질문</h2>
        <div className='space-y-3 text-sm'>
          <div>
            <p className='text-text font-semibold'>Q. 분기가 바뀌면 이전 벌점은 사라지나요?</p>
            <p className='text-text-muted'>
              화면에 표시되는 누적 벌점은 0으로 초기화되지만, 이력 자체는 보존됩니다.
            </p>
          </div>
          <div>
            <p className='text-text font-semibold'>Q. 30점에 도달하면 바로 퇴원되나요?</p>
            <p className='text-text-muted'>
              자동 퇴원이 아니라 관리자의 검토 대상이 되며, 면담 후 결정됩니다.
            </p>
          </div>
          <div>
            <p className='text-text font-semibold'>
              Q. 100점이 넘어도 상품권을 신청하지 않으면 어떻게 되나요?
            </p>
            <p className='text-text-muted'>
              잔여 상점은 그대로 보존됩니다. 단, 30점 도달 시 100점 단위만 보호되고 잔여는 소멸되니
              100점 도달 시 빠른 신청을 권장합니다.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
