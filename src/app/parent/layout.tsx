import { PushTokenListener } from '@/components/PushTokenListener';
import { BottomNav } from '@/components/shared/bottom-nav';
import { ParentHeader } from '@/components/parent/header';
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

  if (user) {
    // 학부모 프로필 조회
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .single();

    userName = profile?.name;

    // 연결된 자녀 목록 조회 — 퇴원 자녀도 포함하되 헤더에서 배지로 식별 가능하게 한다.
    const students = await getLinkedStudents();
    linkedChildren = students.map((s) => ({
      id: s.id,
      name: s.name,
      withdrawnAt: s.withdrawnAt,
    }));
  }

  const { count: initialUnreadChatCount } = await getParentUnreadChatCount();

  return (
    <div className='bg-background min-h-screen'>
      <PushTokenListener />
      <ParentHeader userName={userName} linkedChildren={linkedChildren} />
      <main className='mx-auto max-w-lg pb-24'>{children}</main>
      <BottomNav
        userType='parent'
        basePath='/parent'
        initialUnreadChatCount={initialUnreadChatCount}
      />
    </div>
  );
}
