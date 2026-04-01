import { BottomNav } from '@/components/shared/bottom-nav';
import { StudentHeader } from '@/components/student/header';
import { createClient } from '@/lib/supabase/server';
import { getStudentUnreadChatCount } from '@/lib/actions/chat';

/** 학생 주요 화면: 헤더 + 하단 탭. `/student/pending`은 이 레이아웃 밖. */
export default async function StudentShellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let userName: string | undefined;
  let seatNumber: number | undefined;
  let unreadNotificationCount = 0;

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .single();

    const { data: studentProfile } = await supabase
      .from('student_profiles')
      .select('seat_number')
      .eq('id', user.id)
      .single();

    const { count } = await supabase
      .from('student_notifications')
      .select('*', { count: 'exact', head: true })
      .eq('student_id', user.id)
      .eq('is_read', false);

    userName = profile?.name;
    seatNumber = studentProfile?.seat_number ?? undefined;
    unreadNotificationCount = count || 0;
  }

  const { count: initialUnreadChatCount } = await getStudentUnreadChatCount();

  return (
    <>
      <StudentHeader
        userName={userName}
        seatNumber={seatNumber}
        initialUnreadCount={unreadNotificationCount}
      />
      <main className="pb-24 max-w-lg mx-auto">{children}</main>
      <BottomNav userType="student" basePath="/student" initialUnreadChatCount={initialUnreadChatCount} />
    </>
  );
}
