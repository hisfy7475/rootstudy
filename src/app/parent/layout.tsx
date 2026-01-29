import { BottomNav } from '@/components/shared/bottom-nav';
import { ParentHeader } from '@/components/parent/header';
import { createClient } from '@/lib/supabase/server';
import { getLinkedStudents } from '@/lib/actions/parent';

interface LayoutProps {
  children: React.ReactNode;
}

export default async function ParentLayout({
  children,
}: LayoutProps) {
  const supabase = await createClient();
  
  // 현재 사용자 정보 조회
  const { data: { user } } = await supabase.auth.getUser();
  
  let userName: string | undefined;
  let linkedChildren: { id: string; name: string }[] = [];

  if (user) {
    // 학부모 프로필 조회
    const { data: profile } = await supabase
      .from('profiles')
      .select('name')
      .eq('id', user.id)
      .single();

    userName = profile?.name;

    // 연결된 자녀 목록 조회
    const students = await getLinkedStudents();
    linkedChildren = students.map(s => ({ id: s.id, name: s.name }));
  }

  return (
    <div className="min-h-screen bg-background">
      <ParentHeader 
        userName={userName} 
        children={linkedChildren}
      />
      <main className="pb-24 max-w-lg mx-auto">{children}</main>
      <BottomNav userType="parent" basePath="/parent" />
    </div>
  );
}
