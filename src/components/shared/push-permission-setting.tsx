'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { openAppSettings } from '@/lib/native-bridge';
import { isNativeApp } from '@/lib/utils';
import { usePushPermission } from './push-permission-provider';

/**
 * 설정 화면 "알림" 상태 항목(상시 노출). 네이티브가 전달한 권한 상태를 표시하고,
 * 꺼져 있으면 기기 설정을 열도록 유도한다. 상단 배너와 달리 닫을 수 없다.
 */
export function PushPermissionSetting() {
  const { status } = usePushPermission();
  const native = isNativeApp();

  return (
    <Card className='p-4'>
      <h2 className='text-text mb-2 font-semibold'>알림</h2>

      {status === 'granted' && <p className='text-success text-sm'>알림이 켜져 있습니다.</p>}

      {(status === 'denied' || status === 'undetermined') && (
        <div className='space-y-3'>
          <p className='text-text-muted text-sm'>
            알림이 꺼져 있어 입퇴실·신청 알림을 받지 못합니다. 기기 설정에서 알림을 켜주세요.
          </p>
          {native && (
            <Button onClick={openAppSettings} className='w-full'>
              알림 설정 열기
            </Button>
          )}
        </div>
      )}

      {status === null && (
        <p className='text-text-muted text-sm'>
          {native ? '알림 상태를 확인하는 중입니다.' : '알림은 앱에서 켤 수 있습니다.'}
        </p>
      )}
    </Card>
  );
}
