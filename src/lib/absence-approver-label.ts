import type { Database, StudentAbsenceSchedule } from '@/types/database';

type UserType = Database['public']['Tables']['profiles']['Row']['user_type'];

/** 부재 스케줄 목록/카드용 (서버 조회 시 approver_display 설정) */
export type AbsenceScheduleListItem = StudentAbsenceSchedule & {
  approver_display?: string | null;
};

export function formatAbsenceApproverDisplay(
  name: string | null | undefined,
  userType: UserType | null | undefined
): string | null {
  if (!name?.trim()) return null;
  const n = name.trim();
  const role =
    userType === 'admin'
      ? '관리자'
      : userType === 'parent'
        ? '학부모'
        : userType === 'student'
          ? '학생'
          : null;
  return role ? `${n} (${role})` : n;
}

/** 승인된 일정에 표시할 승인자 문구 (프로필 없으면 안내) */
export function approvedByCaption(
  status: StudentAbsenceSchedule['status'],
  approverDisplay: string | null | undefined
): string | null {
  if (status !== 'approved') return null;
  return approverDisplay?.trim() || '승인자 정보 없음';
}
