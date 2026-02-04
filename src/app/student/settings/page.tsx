import { getStudentProfile, getLinkedParents } from '@/lib/actions/student';
import { getStudentTypes } from '@/lib/actions/student-type';
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

  // 해당 지점의 학생 타입 목록 조회
  const studentTypes = profile.branchId 
    ? await getStudentTypes(profile.branchId) 
    : [];

  return (
    <SettingsClient 
      profile={profile} 
      linkedParents={linkedParents} 
      studentTypes={studentTypes}
    />
  );
}
