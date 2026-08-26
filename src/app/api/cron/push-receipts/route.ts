import { NextResponse } from 'next/server';
import { sweepPushReceipts } from '@/lib/push';

// 푸시 영수증(receipt) 확인 크론 (30분마다, "*/30 * * * *")
//
// 배경: Expo 는 발송 요청 응답(ticket)에서 "접수했다"까지만 알려주고, 실제 단말 도달 실패
//       (DeviceNotRegistered = 앱 삭제/알림 끔/토큰 만료)는 15분쯤 뒤 조회하는 receipt 로
//       알려준다. 지금까지 ticket 만 봤기 때문에 죽은 토큰이 push_tokens 에 활성으로 남아
//       "보냈는데 안 온다"가 로그상 정상 발송으로 보였다.
//
// 하는 일
//   1. push_delivery_log 의 미확정(status='accepted') 건 중 15분 이상 지난 것을 조회
//   2. Expo 영수증으로 delivered / failed 확정 (24시간 초과분은 unknown 으로 종결)
//   3. DeviceNotRegistered 토큰은 push_tokens.is_active=false 로 내림
//   4. 보관 기간(30일) 지난 로그 정리
//
// 실패해도 발송 자체에는 영향이 없다(사후 정리 크론).

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await sweepPushReceipts();
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error('[cron/push-receipts]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
