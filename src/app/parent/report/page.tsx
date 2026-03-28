import { getLinkedStudents } from '@/lib/actions/parent';
import { getImmersionReportData, getWeeklyStudyTrend } from '@/lib/actions/report';
import { getWeekStart, formatDateKST } from '@/lib/utils';
import { ParentReportClient } from './report-client';

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

  const firstStudent = students[0]!;
  const weekStartStr = formatDateKST(getWeekStart());

  const [report, trend] = await Promise.all([
    getImmersionReportData(firstStudent.id, weekStartStr),
    getWeeklyStudyTrend(firstStudent.id, 8),
  ]);

  return (
    <ParentReportClient
      students={students}
      initialStudentId={firstStudent.id}
      initialWeekStart={weekStartStr}
      currentWeekStartMonday={weekStartStr}
      initialReport={report}
      initialTrend={trend}
    />
  );
}
