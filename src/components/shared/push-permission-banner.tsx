'use client';

import { BellOff, X } from 'lucide-react';
import { useState } from 'react';

import { openAppSettings } from '@/lib/native-bridge';
import { isNativeApp } from '@/lib/utils';
import { usePushPermission } from './push-permission-provider';

const DISMISS_KEY = 'push-banner-dismissed';

function readDismissed(): boolean {
  return typeof window !== 'undefined' && sessionStorage.getItem(DISMISS_KEY) === '1';
}

/**
 * 알림 권한이 거부된 네이티브 앱 사용자에게 "알림 켜기 → 설정 열기"를 안내하는 상단 배너.
 *
 * - status === 'denied' 일 때만 노출(iOS provisional 은 네이티브에서 'granted' 로 정규화됨).
 * - 닫기 상태는 sessionStorage 에 저장 → 같은 앱 세션(soft nav·전체 리로드·재로그인 포함) 동안은
 *   유지되고, 앱을 완전히 종료 후 재실행(WebView 재생성)하면 초기화되어 다시 뜬다. (sessionStorage 는
 *   페이지 새로고침으론 안 지워지고 WebView 세션이 끝날 때 비워지므로, "세션당 1회 안내" 가 된다.)
 */
export function PushPermissionBanner() {
  const { status } = usePushPermission();
  // 초기값을 lazy 로 읽는다. 하이드레이션 시점엔 status 가 아직 null 이라 배너 자체가 렌더되지
  // 않으므로(아래 조건), 서버/클라 초기 렌더가 일치해 hydration mismatch 가 없다.
  const [dismissed, setDismissed] = useState(readDismissed);

  if (dismissed || status !== 'denied' || !isNativeApp()) return null;

  const dismiss = () => {
    if (typeof window !== 'undefined') sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div className='px-4 pt-3'>
      <div className='bg-warning/25 flex items-start gap-3 rounded-xl p-3'>
        <BellOff className='text-foreground mt-0.5 h-5 w-5 shrink-0' />
        <div className='min-w-0 flex-1'>
          <p className='text-foreground text-sm font-medium'>알림이 꺼져 있습니다</p>
          <p className='text-foreground/70 mt-0.5 text-xs'>
            입퇴실·신청 알림을 받으려면 기기 설정에서 알림을 켜주세요.
          </p>
          <button
            type='button'
            onClick={openAppSettings}
            className='bg-primary text-primary-foreground mt-2 rounded-lg px-3 py-1.5 text-xs font-semibold'
          >
            설정 열기
          </button>
        </div>
        <button
          type='button'
          onClick={dismiss}
          aria-label='닫기'
          className='text-foreground/50 -m-1 shrink-0 p-1'
        >
          <X className='h-4 w-4' />
        </button>
      </div>
    </div>
  );
}
