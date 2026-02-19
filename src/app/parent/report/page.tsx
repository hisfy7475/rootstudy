import { getLinkedStudents } from '@/lib/actions/parent';
import { getWeeklyReportData } from '@/lib/actions/parent';
import { getWeekStart } from '@/lib/utils';
import { ReportClient } from './report-client';

export default async function ParentReportPage() {
  const students = await getLinkedStudents();

  if (students.length === 0) {
    return (
      <div className="p-4 flex flex-col items-center justify-center min-h-[50vh] text-center">
        <p className="text-text-muted text-sm">
          연결된 자녀가 없습니다.
          <br />
          설정에서 자녀를 연결해주세요.
        </p>
      </div>
    );
  }

  // 첫 번째 자녀의 이번 주 리포트를 기본으로 로드
  const weekStart = getWeekStart();
  const initialReport = await getWeeklyReportData(students[0].id, weekStart);

  return (
    <ReportClient
      students={students}
      initialStudentId={students[0].id}
      initialWeekStart={weekStart.toISOString()}
      initialReport={initialReport}
    />
  );
}
