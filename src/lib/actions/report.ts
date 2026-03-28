'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  formatDateKST,
  getCalendarWeekBoundsKST,
  getStudyDayBounds,
  getWeekDateStringsFromMondayKST,
  getWeekStart,
  getTodayKST,
} from '@/lib/utils';
import {
  SUBJECT_CATEGORY_ORDER,
  getSubjectCategory,
  COUNSELING_TEMPLATES,
} from '@/lib/constants';
import type { SubjectCategory } from '@/lib/constants';

// === 반환 타입 정의 ===

export interface DailySubjectData {
  dayLabel: string;
  categories: Record<SubjectCategory, number>;
}

export interface DailyReportData {
  date: string;
  studySeconds: number;
  hasAttendance: boolean;
  focusAvg: number | null;
}

export interface AttendanceStat {
  totalWeekdays: number;
  attendedDays: number;
  absentDays: number;
  attendanceRate: number;
  absentRate: number;
}

export interface PointItem {
  reason: string;
  amount: number;
  count: number;
}

export interface PointsSummary {
  totalReward: number;
  totalPenalty: number;
  rewardItems: PointItem[];
  penaltyItems: PointItem[];
}

export interface CounselingReportData {
  id: string | null;
  focusAvg: number | null;
  studyFeedback: string;
  guidanceNotes: string;
  adminNotes: string | null;
  parentSummary: string;
}

export interface ImmersionReportData {
  studentId: string;
  studentName: string;
  studentTypeName: string | null;
  weekStart: string;
  weekEnd: string;
  dailyData: DailyReportData[];
  attendanceStat: AttendanceStat;
  weeklyFocusAvg: number | null;
  gradeStudyAvgSeconds: number;
  subjectByDay: DailySubjectData[];
  points: PointsSummary;
  counseling: CounselingReportData;
}

export interface WeeklyTrendPoint {
  weekLabel: string;
  weekStart: string;
  mySeconds: number;
  gradeMaxSeconds: number;
  gradeAvgSeconds: number;
}

type AttendanceRecord = { type: string; timestamp: string };

interface StudySessionChunk {
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
}

function extractStudySessions(
  attendance: AttendanceRecord[],
  periodEnd: Date
): StudySessionChunk[] {
  const sessions: StudySessionChunk[] = [];
  let checkInTime: Date | null = null;

  for (const record of attendance) {
    const timestamp = new Date(record.timestamp);

    switch (record.type) {
      case 'check_in':
        checkInTime = timestamp;
        break;
      case 'check_out':
        if (checkInTime) {
          sessions.push({
            startTime: checkInTime,
            endTime: timestamp,
            durationSeconds: Math.floor(
              (timestamp.getTime() - checkInTime.getTime()) / 1000
            ),
          });
          checkInTime = null;
        }
        break;
      case 'break_start':
        if (checkInTime) {
          sessions.push({
            startTime: checkInTime,
            endTime: timestamp,
            durationSeconds: Math.floor(
              (timestamp.getTime() - checkInTime.getTime()) / 1000
            ),
          });
          checkInTime = null;
        }
        break;
      case 'break_end':
        checkInTime = timestamp;
        break;
    }
  }

  if (checkInTime) {
    const now = new Date();
    const endTime = now < periodEnd ? now : periodEnd;
    sessions.push({
      startTime: checkInTime,
      endTime,
      durationSeconds: Math.floor(
        (endTime.getTime() - checkInTime.getTime()) / 1000
      ),
    });
  }

  return sessions;
}

function calculateStudySeconds(
  attendanceRecords: AttendanceRecord[],
  dayStart: Date,
  dayEnd: Date
): { studySeconds: number; hasAttendance: boolean } {
  const dayAttendance = attendanceRecords
    .filter((r) => {
      const t = new Date(r.timestamp);
      return t >= dayStart && t <= dayEnd;
    })
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

  const hasAttendance = dayAttendance.some((r) => r.type === 'check_in');
  const sessions = extractStudySessions(dayAttendance, dayEnd);
  const studySeconds = sessions.reduce((sum, s) => sum + s.durationSeconds, 0);
  return { studySeconds, hasAttendance };
}

function subjectOverlapSeconds(
  sessions: StudySessionChunk[],
  subjectStart: Date,
  subjectEnd: Date
): number {
  let effectiveSeconds = 0;
  for (const session of sessions) {
    const overlapStart = Math.max(
      subjectStart.getTime(),
      session.startTime.getTime()
    );
    const overlapEnd = Math.min(
      subjectEnd.getTime(),
      session.endTime.getTime()
    );
    if (overlapEnd > overlapStart) {
      effectiveSeconds += Math.floor((overlapEnd - overlapStart) / 1000);
    }
  }
  return effectiveSeconds;
}

function emptyCategoryRecord(): Record<SubjectCategory, number> {
  const rec = {} as Record<SubjectCategory, number>;
  for (const c of SUBJECT_CATEGORY_ORDER) {
    rec[c] = 0;
  }
  return rec;
}

function groupPointsByReason(
  rows: Array<{ type: string; amount: number; reason: string | null }>
): {
  totalReward: number;
  totalPenalty: number;
  rewardItems: PointItem[];
  penaltyItems: PointItem[];
} {
  const rewardMap = new Map<string, { amount: number; count: number }>();
  const penaltyMap = new Map<string, { amount: number; count: number }>();
  let totalReward = 0;
  let totalPenalty = 0;

  for (const row of rows) {
    const reason = row.reason?.trim() || '(사유 없음)';
    if (row.type === 'reward') {
      totalReward += row.amount;
      const cur = rewardMap.get(reason) ?? { amount: 0, count: 0 };
      cur.amount += row.amount;
      cur.count += 1;
      rewardMap.set(reason, cur);
    } else if (row.type === 'penalty') {
      totalPenalty += row.amount;
      const cur = penaltyMap.get(reason) ?? { amount: 0, count: 0 };
      cur.amount += row.amount;
      cur.count += 1;
      penaltyMap.set(reason, cur);
    }
  }

  const toItems = (m: Map<string, { amount: number; count: number }>): PointItem[] =>
    [...m.entries()].map(([reason, v]) => ({
      reason,
      amount: v.amount,
      count: v.count,
    }));

  return {
    totalReward,
    totalPenalty,
    rewardItems: toItems(rewardMap),
    penaltyItems: toItems(penaltyMap),
  };
}

function weeklyStudySecondsFromAttendance(
  records: AttendanceRecord[],
  rangeStart: Date,
  rangeEndExclusive: Date
): number {
  const now = new Date();
  const sessionCap =
    now.getTime() < rangeEndExclusive.getTime()
      ? now
      : new Date(rangeEndExclusive.getTime() - 1);

  const filtered = records
    .filter((r) => {
      const t = new Date(r.timestamp);
      return t >= rangeStart && t < rangeEndExclusive;
    })
    .sort(
      (a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

  const sessions = extractStudySessions(filtered, sessionCap);
  return sessions.reduce((sum, s) => sum + s.durationSeconds, 0);
}

async function assertReportViewer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  userType: string,
  studentId: string
): Promise<boolean> {
  if (userType === 'student') return userId === studentId;
  if (userType === 'admin') return true;
  if (userType === 'parent') {
    const { data } = await supabase
      .from('parent_student_links')
      .select('student_id')
      .eq('parent_id', userId)
      .eq('student_id', studentId)
      .maybeSingle();
    return !!data;
  }
  return false;
}

export async function getImmersionReportData(
  studentId: string,
  weekStartMonday: string
): Promise<ImmersionReportData | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: caller } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  const userType = caller?.user_type as string | undefined;
  if (!userType) return null;

  const allowed = await assertReportViewer(supabase, user.id, userType, studentId);
  if (!allowed) return null;

  const { data: studentRow, error: studentErr } = await supabase
    .from('student_profiles')
    .select(
      `
      id,
      student_type_id,
      profiles!inner (
        name,
        branch_id
      )
    `
    )
    .eq('id', studentId)
    .single();

  if (studentErr || !studentRow) return null;

  const profile = studentRow.profiles as unknown as {
    name: string;
    branch_id: string | null;
  };
  const studentName = profile.name;
  const studentTypeId = studentRow.student_type_id as string | null;

  let studentTypeName: string | null = null;
  if (studentTypeId) {
    const { data: st } = await supabase
      .from('student_types')
      .select('name')
      .eq('id', studentTypeId)
      .single();
    studentTypeName = st?.name ?? null;
  }

  const weekDates = getWeekDateStringsFromMondayKST(weekStartMonday);
  const { start: periodStart } = getStudyDayBounds(weekDates[0]!);
  const { end: periodEnd } = getStudyDayBounds(weekDates[6]!);

  const [
    { data: peerRows },
    { data: attendanceRows },
    { data: focusScores },
    { data: subjectRows },
    { data: pointRows },
    { data: counselingRow },
  ] = await Promise.all([
    studentTypeId
      ? supabase.from('student_profiles').select('id').eq('student_type_id', studentTypeId)
      : Promise.resolve({ data: [] as { id: string }[] }),
    supabase
      .from('attendance')
      .select('type, timestamp')
      .eq('student_id', studentId)
      .gte('timestamp', periodStart.toISOString())
      .lte('timestamp', periodEnd.toISOString())
      .order('timestamp', { ascending: true }),
    supabase
      .from('focus_scores')
      .select('score, recorded_at')
      .eq('student_id', studentId)
      .gte('recorded_at', periodStart.toISOString())
      .lte('recorded_at', periodEnd.toISOString()),
    supabase
      .from('subjects')
      .select('subject_name, started_at, ended_at, is_current')
      .eq('student_id', studentId)
      .lt('started_at', periodEnd.toISOString()),
    supabase
      .from('points')
      .select('type, amount, reason')
      .eq('student_id', studentId),
    supabase
      .from('counseling_reports')
      .select('*')
      .eq('student_id', studentId)
      .eq('week_start', weekStartMonday)
      .maybeSingle(),
  ]);

  const attendance = (attendanceRows ?? []) as AttendanceRecord[];
  const peerIds = (peerRows ?? []).map((p) => p.id);
  const subjectsForWeek = (subjectRows ?? []).filter((sub) => {
    const subjectStart = new Date(sub.started_at);
    const subjectEnd = sub.ended_at
      ? new Date(sub.ended_at)
      : sub.is_current
        ? new Date()
        : subjectStart;
    return subjectEnd > periodStart && subjectStart < periodEnd;
  });

  let gradeStudyAvgSeconds = 0;
  if (peerIds.length > 0) {
    const { data: gradeAttendance } = await supabase
      .from('attendance')
      .select('student_id, type, timestamp')
      .in('student_id', peerIds)
      .gte('timestamp', periodStart.toISOString())
      .lte('timestamp', periodEnd.toISOString())
      .order('timestamp', { ascending: true });

    const byStudent = new Map<string, AttendanceRecord[]>();
    for (const row of gradeAttendance ?? []) {
      const sid = (row as { student_id: string }).student_id;
      const rec = row as AttendanceRecord & { student_id: string };
      const list = byStudent.get(sid) ?? [];
      list.push({ type: rec.type, timestamp: rec.timestamp });
      byStudent.set(sid, list);
    }

    let sum = 0;
    let n = 0;
    for (const sid of peerIds) {
      const recs = byStudent.get(sid) ?? [];
      const secs = extractStudySessions(recs, periodEnd).reduce(
        (acc, s) => acc + s.durationSeconds,
        0
      );
      sum += secs;
      n += 1;
    }
    gradeStudyAvgSeconds = n > 0 ? Math.round(sum / n) : 0;
  }

  const dayLabels = ['월', '화', '수', '목', '금', '토', '일'] as const;

  const dailyData: DailyReportData[] = weekDates.map((dateStr, idx) => {
    const { start, end } = getStudyDayBounds(dateStr);
    const { studySeconds, hasAttendance } = calculateStudySeconds(
      attendance,
      start,
      end
    );

    const dayFocus = (focusScores ?? []).filter((f) => {
      const t = new Date(f.recorded_at);
      return t >= start && t <= end;
    });
    const focusAvg =
      dayFocus.length > 0
        ? Math.round(
            (dayFocus.reduce((sum, f) => sum + Number(f.score), 0) /
              dayFocus.length) *
              10
          ) / 10
        : null;

    return { date: dateStr, studySeconds, hasAttendance, focusAvg };
  });

  const weekdays = dailyData.slice(0, 5);
  const todayKst = getTodayKST();
  const pastWeekdays = weekdays.filter((d) => d.date <= todayKst);
  const attendedDays = pastWeekdays.filter((d) => d.hasAttendance).length;
  const absentDays = pastWeekdays.length - attendedDays;
  const totalWeekdays = pastWeekdays.length;
  const attendanceRate =
    totalWeekdays > 0 ? Math.round((attendedDays / totalWeekdays) * 100) : 0;
  const absentRate =
    totalWeekdays > 0 ? Math.round((absentDays / totalWeekdays) * 100) : 0;

  const focusDays = dailyData.filter((d) => d.focusAvg !== null);
  const weeklyFocusAvg =
    focusDays.length > 0
      ? Math.round(
          (focusDays.reduce((sum, d) => sum + (d.focusAvg ?? 0), 0) /
            focusDays.length) *
            10
        ) / 10
      : null;

  const subjectByDay: DailySubjectData[] = weekDates.map((dateStr, idx) => {
    const { start: dayStart, end: dayEnd } = getStudyDayBounds(dateStr);
    const dayAttendance = attendance.filter((r) => {
      const t = new Date(r.timestamp);
      return t >= dayStart && t <= dayEnd;
    });
    const sessions = extractStudySessions(dayAttendance, dayEnd);
    const totalStudy = sessions.reduce((sum, s) => sum + s.durationSeconds, 0);

    const categories = emptyCategoryRecord();
    let classified = 0;

    for (const sub of subjectsForWeek) {
      const subjectStart = new Date(sub.started_at);
      const subjectEnd = sub.ended_at
        ? new Date(sub.ended_at)
        : sub.is_current
          ? new Date()
          : subjectStart;
      if (subjectEnd <= dayStart || subjectStart >= dayEnd) continue;

      const cat = getSubjectCategory(sub.subject_name);
      const secs = subjectOverlapSeconds(sessions, subjectStart, subjectEnd);
      if (secs <= 0) continue;
      categories[cat] += secs;
      classified += secs;
    }

    const unclassified = Math.max(0, totalStudy - classified);
    categories['미분류'] = unclassified;

    return {
      dayLabel: dayLabels[idx]!,
      categories,
    };
  });

  const points = groupPointsByReason(
    (pointRows ?? []) as Array<{
      type: string;
      amount: number;
      reason: string | null;
    }>
  );

  const studyHoursWeekly =
    dailyData.reduce((sum, d) => sum + d.studySeconds, 0) / 3600;

  let counseling: CounselingReportData;

  if (counselingRow) {
    counseling = {
      id: counselingRow.id,
      focusAvg:
        counselingRow.focus_avg !== null
          ? Number(counselingRow.focus_avg)
          : weeklyFocusAvg,
      studyFeedback: counselingRow.study_feedback ?? '',
      guidanceNotes: counselingRow.guidance_notes ?? '',
      adminNotes: counselingRow.admin_notes,
      parentSummary: counselingRow.parent_summary ?? '',
    };
  } else {
    counseling = {
      id: null,
      focusAvg: weeklyFocusAvg,
      studyFeedback: COUNSELING_TEMPLATES.getStudyFeedback(weeklyFocusAvg),
      guidanceNotes: COUNSELING_TEMPLATES.getGuidanceNotes(weeklyFocusAvg),
      adminNotes: null,
      parentSummary: COUNSELING_TEMPLATES.getParentSummary(
        studentName,
        weeklyFocusAvg,
        studyHoursWeekly
      ),
    };
  }

  const { start: calStart } = getCalendarWeekBoundsKST(weekStartMonday);
  const { endExclusive } = getCalendarWeekBoundsKST(weekStartMonday);
  const weekEndIso = new Date(endExclusive.getTime() - 1).toISOString();

  return {
    studentId,
    studentName,
    studentTypeName,
    weekStart: calStart.toISOString(),
    weekEnd: weekEndIso,
    dailyData,
    attendanceStat: {
      totalWeekdays,
      attendedDays,
      absentDays,
      attendanceRate,
      absentRate,
    },
    weeklyFocusAvg,
    gradeStudyAvgSeconds,
    subjectByDay,
    points,
    counseling,
  };
}

export async function getWeeklyStudyTrend(
  studentId: string,
  weeks: number = 8
): Promise<WeeklyTrendPoint[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: caller } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();
  const userType = caller?.user_type as string | undefined;
  if (!userType) return [];

  const allowed = await assertReportViewer(supabase, user.id, userType, studentId);
  if (!allowed) return [];

  const { data: sp } = await supabase
    .from('student_profiles')
    .select('student_type_id')
    .eq('id', studentId)
    .single();
  const studentTypeId = sp?.student_type_id ?? null;

  const { data: peerRows } = studentTypeId
    ? await supabase
        .from('student_profiles')
        .select('id')
        .eq('student_type_id', studentTypeId)
    : { data: [] as { id: string }[] };

  const peerIds = (peerRows ?? []).map((p) => p.id);

  const currentMondayStr = formatDateKST(getWeekStart());
  const mondays: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(
      new Date(`${currentMondayStr}T12:00:00+09:00`).getTime() -
        i * 7 * 24 * 60 * 60 * 1000
    );
    mondays.push(formatDateKST(d));
  }

  if (mondays.length === 0) return [];

  const rangeStart = getCalendarWeekBoundsKST(mondays[0]!).start;
  const rangeEnd = getCalendarWeekBoundsKST(mondays[mondays.length - 1]!).endExclusive;

  const { data: trendAttendance } = await supabase
    .from('attendance')
    .select('student_id, type, timestamp')
    .in('student_id', peerIds.length > 0 ? [...new Set([...peerIds, studentId])] : [studentId])
    .gte('timestamp', rangeStart.toISOString())
    .lt('timestamp', rangeEnd.toISOString())
    .order('timestamp', { ascending: true });

  const byStudent = new Map<string, AttendanceRecord[]>();
  for (const row of trendAttendance ?? []) {
    const sid = (row as { student_id: string }).student_id;
    const rec = row as AttendanceRecord & { student_id: string };
    const list = byStudent.get(sid) ?? [];
    list.push({ type: rec.type, timestamp: rec.timestamp });
    byStudent.set(sid, list);
  }

  const result: WeeklyTrendPoint[] = [];
  const n = mondays.length;

  for (let i = 0; i < n; i++) {
    const mondayStr = mondays[i]!;
    const { start, endExclusive } = getCalendarWeekBoundsKST(mondayStr);
    const weeksAgo = n - 1 - i;
    const weekLabel = weeksAgo === 0 ? '이번 주' : `${weeksAgo}주 전`;

    const myRecs = byStudent.get(studentId) ?? [];
    const mySeconds = weeklyStudySecondsFromAttendance(
      myRecs,
      start,
      endExclusive
    );

    let gradeMaxSeconds = 0;
    let gradeAvgSeconds = 0;
    if (peerIds.length > 0) {
      const totals: number[] = [];
      for (const sid of peerIds) {
        const recs = byStudent.get(sid) ?? [];
        totals.push(
          weeklyStudySecondsFromAttendance(recs, start, endExclusive)
        );
      }
      gradeMaxSeconds = totals.length > 0 ? Math.max(...totals) : 0;
      gradeAvgSeconds =
        totals.length > 0
          ? Math.round(
              totals.reduce((a, b) => a + b, 0) / totals.length
            )
          : 0;
    }

    result.push({
      weekLabel,
      weekStart: mondayStr,
      mySeconds,
      gradeMaxSeconds,
      gradeAvgSeconds,
    });
  }

  return result;
}

export async function getCounselingReport(
  studentId: string,
  weekStartMonday: string
): Promise<CounselingReportData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      id: null,
      focusAvg: null,
      studyFeedback: COUNSELING_TEMPLATES.getStudyFeedback(null),
      guidanceNotes: COUNSELING_TEMPLATES.getGuidanceNotes(null),
      adminNotes: null,
      parentSummary: '',
    };
  }

  const { data: caller } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();
  const userType = caller?.user_type as string | undefined;

  if (
    !userType ||
    !(await assertReportViewer(supabase, user.id, userType, studentId))
  ) {
    return {
      id: null,
      focusAvg: null,
      studyFeedback: COUNSELING_TEMPLATES.getStudyFeedback(null),
      guidanceNotes: COUNSELING_TEMPLATES.getGuidanceNotes(null),
      adminNotes: null,
      parentSummary: '',
    };
  }

  const { data: row } = await supabase
    .from('counseling_reports')
    .select('*')
    .eq('student_id', studentId)
    .eq('week_start', weekStartMonday)
    .maybeSingle();

  if (row) {
    return {
      id: row.id,
      focusAvg: row.focus_avg !== null ? Number(row.focus_avg) : null,
      studyFeedback: row.study_feedback ?? '',
      guidanceNotes: row.guidance_notes ?? '',
      adminNotes: row.admin_notes,
      parentSummary: row.parent_summary ?? '',
    };
  }

  const weekDates = getWeekDateStringsFromMondayKST(weekStartMonday);
  const { start: periodStart } = getStudyDayBounds(weekDates[0]!);
  const { end: periodEnd } = getStudyDayBounds(weekDates[6]!);

  const { data: focusRows } = await supabase
    .from('focus_scores')
    .select('score')
    .eq('student_id', studentId)
    .gte('recorded_at', periodStart.toISOString())
    .lte('recorded_at', periodEnd.toISOString());

  const focusList = focusRows ?? [];
  const focusAvg =
    focusList.length > 0
      ? Math.round(
          (focusList.reduce((s, f) => s + Number(f.score), 0) / focusList.length) *
            10
        ) / 10
      : null;

  const { data: studentRow } = await supabase
    .from('student_profiles')
    .select(`profiles!inner (name)`)
    .eq('id', studentId)
    .single();

  const studentName =
    (studentRow?.profiles as unknown as { name: string })?.name ?? '학생';

  const { data: attRows } = await supabase
    .from('attendance')
    .select('type, timestamp')
    .eq('student_id', studentId)
    .gte('timestamp', periodStart.toISOString())
    .lte('timestamp', periodEnd.toISOString())
    .order('timestamp', { ascending: true });

  const att = (attRows ?? []) as AttendanceRecord[];
  let studySecondsWeek = 0;
  for (const dateStr of weekDates) {
    const { start, end } = getStudyDayBounds(dateStr);
    studySecondsWeek += calculateStudySeconds(att, start, end).studySeconds;
  }
  const studyHoursWeekly = studySecondsWeek / 3600;

  return {
    id: null,
    focusAvg,
    studyFeedback: COUNSELING_TEMPLATES.getStudyFeedback(focusAvg),
    guidanceNotes: COUNSELING_TEMPLATES.getGuidanceNotes(focusAvg),
    adminNotes: null,
    parentSummary: COUNSELING_TEMPLATES.getParentSummary(
      studentName,
      focusAvg,
      studyHoursWeekly
    ),
  };
}

export async function saveCounselingReport(params: {
  studentId: string;
  weekStart: string;
  focusAvg: number | null;
  studyFeedback: string;
  guidanceNotes: string;
  adminNotes: string;
  parentSummary: string;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: '로그인이 필요합니다.' };

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (adminProfile?.user_type !== 'admin') {
    return { success: false, error: '관리자만 저장할 수 있습니다.' };
  }

  const { error } = await supabase.from('counseling_reports').upsert(
    {
      student_id: params.studentId,
      admin_id: user.id,
      week_start: params.weekStart,
      focus_avg: params.focusAvg,
      study_feedback: params.studyFeedback,
      guidance_notes: params.guidanceNotes,
      admin_notes: params.adminNotes || null,
      parent_summary: params.parentSummary,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,week_start' }
  );

  if (error) {
    console.error('saveCounselingReport', error);
    return { success: false, error: '저장에 실패했습니다.' };
  }

  revalidatePath('/admin/report');
  return { success: true };
}

export async function getStudentsForReport(
  branchId?: string
): Promise<
  Array<{
    id: string;
    name: string;
    studentTypeName: string | null;
    seatNumber: number | null;
  }>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();

  if (adminProfile?.user_type !== 'admin') return [];

  let query = supabase
    .from('profiles')
    .select('id, name')
    .eq('user_type', 'student')
    .order('name', { ascending: true });

  if (branchId) {
    query = query.eq('branch_id', branchId);
  }

  const { data: profiles } = await query;
  if (!profiles?.length) return [];

  const ids = profiles.map((p) => p.id);
  const { data: sps } = await supabase
    .from('student_profiles')
    .select('id, seat_number, student_type_id')
    .in('id', ids);

  const typeIds = [
    ...new Set((sps ?? []).map((s) => s.student_type_id).filter(Boolean)),
  ] as string[];

  let typeNameById: Record<string, string> = {};
  if (typeIds.length > 0) {
    const { data: types } = await supabase
      .from('student_types')
      .select('id, name')
      .in('id', typeIds);
    typeNameById = Object.fromEntries(
      (types ?? []).map((t) => [t.id, t.name])
    );
  }

  const spById = Object.fromEntries((sps ?? []).map((s) => [s.id, s]));

  return profiles.map((p) => {
    const sp = spById[p.id];
    const tid = sp?.student_type_id ?? null;
    return {
      id: p.id,
      name: p.name,
      studentTypeName: tid ? typeNameById[tid] ?? null : null,
      seatNumber: sp?.seat_number ?? null,
    };
  });
}
