import { getStudentProfile, getLinkedParents } from '@/lib/actions/student';
import { SettingsClient } from './settings-client';

export default async function StudentSettingsPage() {
  const [profile, linkedParents] = await Promise.all([
    getStudentProfile(),
    getLinkedParents(),
  ]);

  if (!profile) {
    return (
      <div className="p-4 text-center text-text-muted">
        프로필 정보를 불러올 수 없습니다.
      </div>
    );
  }

  return <SettingsClient profile={profile} linkedParents={linkedParents} />;
}
