import { getMyMentoringApplications } from '@/lib/actions/mentoring';
import { MentoringMyClient } from '@/app/student/(shell)/mentoring/my/my-client';

export default async function ParentMentoringMyPage() {
  const applications = await getMyMentoringApplications();
  return (
    <div className="px-4 pt-4">
      <h1 className="text-xl font-bold text-foreground mb-1">멘토링 신청 내역</h1>
      <p className="text-sm text-muted-foreground mb-4">자녀 신청 내역을 상태별로 확인하세요.</p>
      <MentoringMyClient initialApplications={applications} />
    </div>
  );
}
