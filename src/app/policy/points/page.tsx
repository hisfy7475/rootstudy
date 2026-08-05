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
          <li>· {PENALTY_RULES.warn25}점 도달 — 경고 (인앱)</li>
          <li className='font-medium text-red-600'>
            · {PENALTY_RULES.withdrawAt}점 도달 — 보유 상점과 1:1 상계 (상점 부족 시 강제 퇴원 대상)
          </li>
        </ul>
      </Card>

      <Card className='space-y-3 border-red-200 bg-red-50/50 p-4'>
        <h2 className='text-base font-bold text-red-700'>③ 30점 도달 시 1:1 상계</h2>
        <p className='text-text text-sm'>
          분기 누적 벌점이 30점에 도달하면 보유 상점과 1:1로 상계됩니다.{' '}
          <strong>벌점 전액을 덮을 수 있을 만큼 상점이 있을 때만 상계</strong>되며, 상점이 부족하면
          상계 없이 강제 퇴원 대상으로 분류됩니다.
        </p>
        <p className='text-text-muted text-xs'>
          예시 ① 상점 50 + 벌점 30 → 양쪽 30씩 차감 → 상점 20 / 벌점 0
          <br />
          예시 ② 상점 14 + 벌점 30 → 상점이 부족해 상계하지 않음 → 상점 14 유지 / 강제 퇴원 대상
          분류
          <br />
          예시 ③ 상점 0 + 벌점 30 → 상계 불가 → 강제 퇴원 대상 분류
        </p>
        <p className='rounded-lg bg-red-100/60 px-2 py-1.5 text-xs font-semibold text-red-800'>
          ※ 상계는 <strong>재원 기간 중 단 한 번</strong>만 적용됩니다. 한 번 상계를 받으면 이후
          분기가 바뀌어도 다시 상계되지 않습니다.
        </p>
        <p className='text-text-muted text-xs'>
          ※ 상품권 발급 대기 중인 상점도 상계 대상에 포함됩니다. 상계로 잔액이 100점 아래로 내려가면
          해당 발급 대기 건은 자동 취소됩니다.
        </p>
        <p className='text-text-muted text-xs'>
          ※ 상계 후 잔존 벌점은 다음 분기 시작 시 함께 초기화됩니다. (상계 자격은 초기화되지
          않습니다)
        </p>
      </Card>

      <Card className='space-y-3 p-4'>
        <h2 className='text-text text-base font-bold'>④ 상품권 발급 ({REWARD_RULES.redeemAt}점)</h2>
        <p className='text-text-muted text-sm'>
          상점 {REWARD_RULES.redeemAt}점이 모이면 발급 대기열에 자동으로 등록되며, 관리자가
          발급합니다. {REWARD_RULES.redeemAt}점만 차감되고 잔여 상점은 그대로 보존됩니다.
        </p>
      </Card>

      <Card className='space-y-3 p-4'>
        <h2 className='text-text text-base font-bold'>⑤ 신규생 적응 기간 면제</h2>
        <p className='text-text-muted text-sm'>
          첫 등원일이 정산 대상 주(직전주) 안에 있는 학생은 그 주의 최소시간 미달 벌점이 면제됩니다.
        </p>
      </Card>

      <Card className='space-y-3 p-4'>
        <h2 className='text-text text-base font-bold'>⑥ 상점 획득 경로</h2>
        <ul className='text-text-muted space-y-1 text-sm'>
          <li>· 주간 학습 목표 시간 달성 (주간 정산)</li>
          <li>· 영단어 시험 월~금 개근 (주간 정산)</li>
          <li>· 멘토링·클리닉·상담 참여 (참여 다음날 정산)</li>
          <li>· 그 밖의 항목은 지점 관리자가 직접 부여합니다.</li>
        </ul>
        <p className='text-text-muted text-xs'>
          자동 부여분은 정산 시점에 상벌점 내역과 알림으로 함께 안내됩니다.
        </p>
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
              자동 퇴원이 아닙니다. 상점이 벌점 전액을 덮을 만큼 있으면 상계되고, 부족하면 강제
              퇴원 대상으로 분류됩니다. 분류되어도 관리자가 확인 후 안내드리며, 실제 퇴원은
              면담을 거쳐 관리자가 직접 실행합니다.
            </p>
          </div>
          <div>
            <p className='text-text font-semibold'>
              Q. 100점이 넘어도 상품권을 신청하지 않으면 어떻게 되나요?
            </p>
            <p className='text-text-muted'>
              상점 100점 단위는 자동으로 발급 대기에 등록되므로 별도 신청이 필요 없습니다. 다만
              발급 대기 중인 상점도 벌점 상계 대상에 포함되며, 상계로 잔액이 100점 아래로
              내려가면 해당 발급 대기 건은 자동 취소됩니다.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
