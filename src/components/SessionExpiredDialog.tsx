'use client';

import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { createClient } from '@/lib/supabase/client';
import { isNativeApp } from '@/lib/utils';
import { postToNative } from '@/lib/native-bridge';

/**
 * 세션 만료 전역 안내 모달.
 *
 * 업로드 등 클라이언트 동작이 세션 만료로 실패하면 `rootstudy:session-expired`
 * 커스텀 이벤트가 발생하고(예: uploads/client.ts의 uploadToBucketAsUser), 이 모달이
 * 사용자를 재로그인으로 유도한다. "alert 후 갇힘 → 수동 로그아웃"을 없애는 1차 조치.
 * 브라우저/네이티브 WebView 공통으로 동작한다.
 */
export function SessionExpiredDialog() {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    const onExpired = () => setOpen(true);
    window.addEventListener('rootstudy:session-expired', onExpired);
    return () => window.removeEventListener('rootstudy:session-expired', onExpired);
  }, []);

  const handleRelogin = async () => {
    setWorking(true);
    try {
      // 죽은 세션 쿠키/로컬 토큰을 정리한 뒤 로그인으로 보낸다.
      // 토큰 회전 충돌을 피하려고 local scope만 정리한다(서버 측 세션은 건드리지 않음).
      try {
        await createClient().auth.signOut({ scope: 'local' });
      } catch {
        // 이미 만료/무효한 세션이면 무시.
      }
      if (isNativeApp()) {
        // 네이티브 쉘의 SecureStore 세션도 정리한 뒤, WebView를 로그인 화면으로 이동시킨다.
        postToNative({ type: 'LOGOUT', payload: {} });
      }
      window.location.href = '/login';
    } finally {
      setWorking(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      title='다시 로그인이 필요해요'
      description={
        '로그인 세션이 만료되어 방금 동작이 완료되지 않았어요.\n다시 로그인하면 바로 이어서 이용할 수 있습니다.'
      }
      confirmText='다시 로그인'
      cancelText='닫기'
      loading={working}
      onConfirm={handleRelogin}
      onCancel={() => setOpen(false)}
    />
  );
}
