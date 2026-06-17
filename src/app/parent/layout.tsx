import { PushTokenListener } from '@/components/PushTokenListener';
import { BottomNav } from '@/components/shared/bottom-nav';
import { ParentHeader } from '@/components/parent/header';
import { ParentCountsProvider } from '@/components/shared/unread-counts-provider';
import { ChatProvider } from '@/lib/chat/provider';
import { createClient } from '@/lib/supabase/server';
import { getLinkedStudents } from '@/lib/actions/parent';
import { getParentUnreadChatCount } from '@/lib/actions/chat';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function ParentLayout({ children }: LayoutProps) {
  const supabase = await createClient();

  // 현재 사용자 정보 조회
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userName: string | undefined;
  let linkedChildren: { id: string; name: string; withdrawnAt: string | null }[] = [];
  let userId: string | undefined;
  let initialUnreadNotificationCount = 0;

  if (user) {
    userId = user.id;

    // 알림 뱃지/페이지 모두 chat type 제외(채팅 탭이 별도 표시) — UX 분리 정책.
    const [{ data: profile }, students, { count: notifCount }] = await Promise.all([
      supabase.from('profiles').select('name').eq('id', user.id).single(),
      getLinkedStudents(),
      supabase
        .from('user_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false)
        .neq('type', 'chat'),
    ]);

    userName = profile?.name;
    linkedChildren = students.map((s) => ({
      id: s.id,
      name: s.name,
      withdrawnAt: s.withdrawnAt,
    }));
    initialUnreadNotificationCount = notifCount ?? 0;
  }

  const { count: initialUnreadChatCount } = await getParentUnreadChatCount();

  return (
    <div className='bg-background min-h-screen'>
      <PushTokenListener />
      <ParentCountsProvider
        key={userId}
        userId={userId}
        initialNotif={initialUnreadNotificationCount}
      >
        <ChatProvider
          currentUserId={userId ?? ''}
          scope='parent'
          currentUserName={userName}
          initialBadge={initialUnreadChatCount}
        >
          <ParentHeader userName={userName} linkedChildren={linkedChildren} userId={userId} />
          <main className='mx-auto max-w-lg pb-24'>{children}</main>
          <BottomNav userType='parent' basePath='/parent' />
        </ChatProvider>
      </ParentCountsProvider>
    </div>
  );
}
