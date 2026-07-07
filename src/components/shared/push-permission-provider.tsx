'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { onNativeMessage } from '@/lib/native-bridge';

/**
 * 네이티브 앱이 전달하는 알림 권한 상태를 보관하는 단일 store.
 *
 * 네이티브(usePushNotifications)가 WebView 로드/포그라운드 복귀/REQUEST_PUSH_TOKEN 시점에
 * `PUSH_PERMISSION_STATUS` 를 보내면 여기서 받아 배너·설정 화면이 공유한다. iOS provisional/
 * ephemeral 은 네이티브에서 이미 'granted' 로 정규화되어 오므로 웹 판정은 단순하다.
 *
 * 구버전 앱·웹 브라우저는 이 메시지를 보내지 않으므로 status 는 null 로 남고(배너 미표시),
 * 하위호환이 유지된다.
 */
export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined';

interface PushPermissionValue {
  status: PushPermissionStatus | null;
  platform: 'ios' | 'android' | null;
}

const PushPermissionContext = createContext<PushPermissionValue>({
  status: null,
  platform: null,
});

export function usePushPermission(): PushPermissionValue {
  return useContext(PushPermissionContext);
}

export function PushPermissionProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<PushPermissionValue>({ status: null, platform: null });

  useEffect(() => {
    // onNativeMessage 는 런타임에 type 필드만 검사하므로 새 메시지도 그대로 도달한다.
    return onNativeMessage((msg) => {
      if (msg.type !== 'PUSH_PERMISSION_STATUS') return;
      setValue({ status: msg.payload.status, platform: msg.payload.platform });
    });
  }, []);

  return <PushPermissionContext.Provider value={value}>{children}</PushPermissionContext.Provider>;
}
