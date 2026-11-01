import { createAdminClient } from '@/lib/supabase/server';
import { fetchAllPaged } from '@/lib/supabase/paginate';
import { sumStudySecondsByStudyDay, type AttendanceRecord } from '@/lib/study-time';
import { getStudyDate, getStudyDayBounds, getWeekStart } from '@/lib/utils';
import {
  ExternalApiError,
  fetchBranchStudents,
  filterByGrade,
  okJson,
  withExternalApi,
} from '@/lib/external-api';

const MAX_DAYS = 31;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const ymdOf = (d: Date) => d.toISOString().slice(0, 10);

function studyDatesBetween(from: string, to: string): string[] {
  const dates: string[] = [];
  const d = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  while (d <= end) {
    dates.push(ymdOf(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

// GET /api/external/v1/study-time[?from=YYYY-MM-DD&to=YYYY-MM-DD&grade=고3]
// 학생별 순공시간 합계. 날짜는 학습일(06:00~다음날 03:00) 기준이며, 앱의 출석부·몰입도 리포트와 같은 계산이다.
// 기본값은 이번 주 월요일 ~ 오늘(주간 순위용). 입실 중인 학생은 지금까지의 시간이 포함된다.
export async function GET(request: Request) {
  return withExternalApi(request, async (ctx) => {
    const url = new URL(request.url);
    const today = ymdOf(getStudyDate());
    const from = url.searchParams.get('from') ?? ymdOf(getStudyDate(getWeekStart()));
    const to = url.searchParams.get('to') ?? today;
    if (!YMD.test(from) || !YMD.test(to) || isNaN(Date.parse(from)) || isNaN(Date.parse(to))) {
      throw new ExternalApiError(400, 'invalid_date', 'from/to 는 YYYY-MM-DD 형식이어야 합니다.');
    }
    if (from > to) throw new ExternalApiError(400, 'invalid_range', 'from 이 to 보다 늦습니다.');
    const studyDates = studyDatesBetween(from, to);
    if (studyDates.length > MAX_DAYS) {
      throw new ExternalApiError(400, 'range_too_long', `조회 기간은 최대 ${MAX_DAYS}일입니다.`);
    }

    const students = filterByGrade(await fetchBranchStudents(ctx), request);
    const ids = students.map((s) => s.id);
    const start = getStudyDayBounds(from).start.toISOString();
    const end = getStudyDayBounds(to).end.toISOString();

    const supabase = createAdminClient();
    const attendance = ids.length
      ? await fetchAllPaged<AttendanceRecord & { student_id: string }>((f, t) =>
          supabase
            .from('attendance')
            .select('student_id, type, timestamp, source, gate_name')
            .in('student_id', ids)
            .gte('timestamp', start)
            .lte('timestamp', end)
            .order('timestamp', { ascending: true })
            .order('id', { ascending: true })
            .range(f, t),
        )
      : [];

    const byStudent = new Map<string, AttendanceRecord[]>();
    for (const r of attendance) {
      const list = byStudent.get(r.student_id) ?? [];
      list.push(r);
      byStudent.set(r.student_id, list);
    }

    const rows = students
      .map((s) => {
        const seconds = sumStudySecondsByStudyDay(byStudent.get(s.id) ?? [], studyDates);
        return { ...s, study_seconds: seconds, study_minutes: Math.floor(seconds / 60) };
      })
      .sort((a, b) => b.study_seconds - a.study_seconds);
    return okJson(rows, { count: rows.length, from, to });
  });
}
