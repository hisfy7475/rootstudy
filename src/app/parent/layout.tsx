import { BottomNav } from '@/components/shared/bottom-nav';
import { ParentHeader } from '@/components/parent/header';
import { createClient } from '@/lib/supabase/server';

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  
  // 현재 사용자 정보 조회
  const { data: { user } } = await supabase.auth.getUser();
  
  let userName: string | undefined;
  let childrenCount = 0;

  if (user) {
    // 학부모 프로필 조회
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .single();

    userName = profile?.name;

    // 연결된 자녀 수 조회
    const { count } = await supabase
      .from('parent_student_links')
      .select('*', { count: 'exact', head: true })
      .eq('parent_id', user.id);

    childrenCount = count || 0;
  }

  return (
    <div className="min-h-screen bg-background">
      <ParentHeader userName={userName} childrenCount={childrenCount} />
      <main className="pb-24 max-w-lg mx-auto">{children}</main>
      <BottomNav userType="parent" basePath="/parent" />
    </div>
  );
}
