import { BottomNav } from '@/components/shared/bottom-nav';
import { StudentHeader } from '@/components/student/header';
import { StudentCountsProvider } from '@/components/shared/unread-counts-provider';
import { ChatProvider } from '@/lib/chat/provider';
import { createClient } from '@/lib/supabase/server';
import { getStudentUnreadChatCount } from '@/lib/actions/chat';

/** 학생 주요 화면: 헤더 + 하단 탭. `/student/pending`은 이 레이아웃 밖. */
export default async function StudentShellLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userName: string | undefined;
  let seatNumber: number | undefined;
  let unreadNotificationCount = 0;
  let userId: string | undefined;

  if (user) {
    userId = user.id;

    // 알림 뱃지/페이지 모두 chat type 제외(채팅 탭이 별도 표시) — UX 분리 정책.
    const [{ data: profile }, { data: studentProfile }, { count: notifCount }] = await Promise.all([
      supabase.from('profiles').select('name').eq('id', user.id).single(),
      supabase.from('student_profiles').select('seat_number').eq('id', user.id).single(),
      supabase
        .from('student_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('student_id', user.id)
        .eq('is_read', false)
        .neq('type', 'chat'),
    ]);

    userName = profile?.name;
    seatNumber = studentProfile?.seat_number ?? undefined;
    unreadNotificationCount = notifCount || 0;
  }

  const { count: initialUnreadChatCount } = await getStudentUnreadChatCount();

  return (
    <StudentCountsProvider key={userId} userId={userId} initialNotif={unreadNotificationCount}>
      <ChatProvider
        currentUserId={userId ?? ''}
        scope='student'
        currentUserName={userName}
        initialBadge={initialUnreadChatCount}
      >
        <StudentHeader userName={userName} seatNumber={seatNumber} userId={userId} />
        <main className='mx-auto max-w-lg pb-24'>{children}</main>
        <BottomNav userType='student' basePath='/student' />
      </ChatProvider>
    </StudentCountsProvider>
  );
}
