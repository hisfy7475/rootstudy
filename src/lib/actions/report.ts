'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  formatDateKST,
  getCalendarWeekBoundsKST,
  getStudyDayBounds,
  getStudyWeekBoundsFromMonday,
  getWeekDateStringsFromMondayKST,
  getWeekStart,
  getTodayKST,
} from '@/lib/utils';
import {
  SUBJECT_CATEGORY_ORDER,
  getSubjectCategory,
  COUNSELING_TEMPLATES,
  FOCUS_SCORE_TEMPLATES,
} from '@/lib/constants';
import type { CounselingTemplate } from '@/types/database';
import type { SubjectCategory } from '@/lib/constants';
import {
  extractStudySessions,
  isStudyExcluded,
  type AttendanceRecord,
  type StudySessionChunk,
} from '@/lib/study-time';

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
  /** 인쇄용 전체 문단(DB/기본 템플릿 기준). 미지정 시 클라이언트에서 focusAvg로 보완 */
  studyFeedbackFull: string;
  /** "상담/멘토링 레터" 본문(과거 향후지도계획 컬럼 재사용). 자유 서술, 자동 채움 없음. */
  guidanceNotes: string;
  /** "상담/멘토링 레터" 추가 메모/첨언. 자유 서술, 자동 채움 없음. */
  mentoringLetter: string;
  adminNotes: string | null;
  parentSummary: string;
  /** 몰입도 단계 라벨(표시용) */
  scoreLabel?: string;
}

/** 성적 1행(과목 단위) */
export interface ExamScoreRow {
  id: string;
  examName: string;
  examType: string;
  examDate: string; // 'YYYY-MM-DD'
  subject: string;
  rawScore: number | null;
  grade: number | null;
  percentile: number | null;
  standardScore: number | null;
  memo: string | null;
}

/** 추이 차트용 회차 포인트 — (examName, examDate) 그룹 */
export interface ExamTrendPoint {
  examName: string;
  examDate: string;
  bySubject: Record<string, { grade: number | null; percentile: number | null }>;
}

export interface ExamScoreReportData {
  /** 해당 주차(시험일 기준)에 속한 성적 */
  weekScores: ExamScoreRow[];
  /** 최근 N회차 과목별 등급/백분위 추이 */
  trend: ExamTrendPoint[];
  /** 추이에 등장하는 과목(범례·정렬용) */
  subjects: string[];
}

/** 멘토링/상담 결과 기록 1건 */
export interface MentoringRecordItem {
  date: string; // 'YYYY-MM-DD'
  type: string; // mentoring | clinic | consult
  mentorName: string | null;
  resultNote: string;
}

export interface ImmersionReportData {
  studentId: string;
  studentName: string;
  studentTypeName: string | null;
  seatNumber: number | null;
  weekStart: string;
  weekEnd: string;
  dailyData: DailyReportData[];
  attendanceStat: AttendanceStat;
  weeklyFocusAvg: number | null;
  gradeStudyPeerAvgSeconds: number;
  subjectByDay: DailySubjectData[];
  points: PointsSummary;
  counseling: CounselingReportData;
  examScores: ExamScoreReportData;
  /** 해당 주차에 기록된 멘토링/상담 결과 */
  mentoringRecords: MentoringRecordItem[];
}

export interface WeeklyTrendPoint {
  weekLabel: string;
  weekStart: string;
  mySeconds: number;
  gradeMaxSeconds: number;
  gradePeerAvgSeconds: number;
}

function calculateStudySeconds(
  attendanceRecords: AttendanceRecord[],
  dayStart: Date,
  dayEnd: Date,
): { studySeconds: number; hasAttendance: boolean } {
  const dayAttendance = attendanceRecords
    .filter((r) => {
      const t = new Date(r.timestamp);
      return t >= dayStart && t <= dayEnd;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const hasAttendance = dayAttendance.some((r) => r.type === 'check_in' && !isStudyExcluded(r));
  const sessions = extractStudySessions(dayAttendance, dayEnd);
  const studySeconds = sessions.reduce((sum, s) => sum + s.durationSeconds, 0);
  return { studySeconds, hasAttendance };
}

function subjectOverlapSeconds(
  sessions: StudySessionChunk[],
  subjectStart: Date,
  subjectEnd: Date,
): number {
  let effectiveSeconds = 0;
  for (const session of sessions) {
    const overlapStart = Math.max(subjectStart.getTime(), session.startTime.getTime());
    const overlapEnd = Math.min(subjectEnd.getTime(), session.endTime.getTime());
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
  rows: Array<{ type: string; amount: number; reason: string | null }>,
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
  rangeEndExclusive: Date,
): number {
  const now = new Date();
  const sessionCap =
    now.getTime() < rangeEndExclusive.getTime() ? now : new Date(rangeEndExclusive.getTime() - 1);

  const filtered = records
    .filter((r) => {
      const t = new Date(r.timestamp);
      return t >= rangeStart && t < rangeEndExclusive;
    })
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const sessions = extractStudySessions(filtered, sessionCap);
  return sessions.reduce((sum, s) => sum + s.durationSeconds, 0);
}

async function assertReportViewer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  userType: string,
  studentId: string,
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

/** 지점·주간 평균에 맞춰 상담 문구 자동 생성 (counseling_templates 우선) */
async function resolveCounselingAutoFill(
  supabase: Awaited<ReturnType<typeof createClient>>,
  branchId: string | null,
  weeklyFocusAvg: number | null,
  studentName: string,
  studyHoursWeekly: number,
): Promise<{
  studyFeedback: string;
  studyFeedbackFull: string;
  guidanceNotes: string;
  parentSummary: string;
  scoreLabel: string;
}> {
  if (weeklyFocusAvg === null) {
    return {
      studyFeedback: COUNSELING_TEMPLATES.getStudyFeedback(null),
      studyFeedbackFull: COUNSELING_TEMPLATES.getStudyFeedbackFull(null),
      guidanceNotes: '',
      parentSummary: COUNSELING_TEMPLATES.getParentSummary(studentName, null, studyHoursWeekly),
      scoreLabel: '',
    };
  }

  const score = Math.min(10, Math.max(6, Math.round(weeklyFocusAvg)));
  let label = COUNSELING_TEMPLATES.getScoreLabel(weeklyFocusAvg);
  let shortText = COUNSELING_TEMPLATES.getStudyFeedback(weeklyFocusAvg);
  let fullText = COUNSELING_TEMPLATES.getStudyFeedbackFull(weeklyFocusAvg);

  if (branchId) {
    const { data: row } = await supabase
      .from('counseling_templates')
      .select('label, short_text, full_text')
      .eq('branch_id', branchId)
      .eq('score', score)
      .maybeSingle();

    if (row) {
      label = row.label;
      shortText = row.short_text;
      fullText = row.full_text;
    }
  }

  const parentSummary = COUNSELING_TEMPLATES.buildParentSummaryWithFeedback(
    studentName,
    weeklyFocusAvg,
    studyHoursWeekly,
    label,
    shortText,
  );

  return {
    studyFeedback: shortText,
    studyFeedbackFull: fullText,
    guidanceNotes: '',
    parentSummary,
    scoreLabel: label,
  };
}

export async function getImmersionReportData(
  studentId: string,
  weekStartMonday: string,
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
      seat_number,
      profiles!inner (
        name,
        branch_id,
        withdrawn_at
      )
    `,
    )
    .eq('id', studentId)
    .single();

  if (studentErr || !studentRow) return null;

  const profile = studentRow.profiles as unknown as {
    name: string;
    branch_id: string | null;
    withdrawn_at: string | null;
  };

  // 학부모가 퇴원 자녀 ID 로 직접 접근하는 경우 활성 데이터를 노출하지 않는다.
  // 어드민은 이력 검토 목적상 퇴원 학생 리포트도 그대로 볼 수 있어야 한다.
  if (userType === 'parent' && profile.withdrawn_at) return null;
  const studentName = profile.name;
  const branchId = profile.branch_id;
  const studentTypeId = studentRow.student_type_id as string | null;
  const seatNumber = studentRow.seat_number != null ? Number(studentRow.seat_number) : null;

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

  // 또래 상위 30% 학습시간 평균은 DB 집계 RPC 로 산출한다(또래 전원 출결을 앱으로 가져오지 않음).
  const [
    { data: peerAvgRaw },
    { data: attendanceRows },
    { data: focusScores },
    { data: subjectRows },
    { data: pointRows },
    { data: counselingRow },
    { data: examScoreRows },
    { data: mentoringResultRows },
  ] = await Promise.all([
    studentTypeId
      ? supabase.rpc('peer_top_avg_seconds', {
          p_student_type_id: studentTypeId,
          p_period_start: periodStart.toISOString(),
          p_period_end: periodEnd.toISOString(),
          p_exclude_student: studentId,
        })
      : Promise.resolve({ data: 0 }),
    supabase
      .from('attendance')
      .select('type, timestamp, source, gate_name')
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
    supabase.from('points').select('type, amount, reason').eq('student_id', studentId),
    supabase
      .from('counseling_reports')
      .select('*')
      .eq('student_id', studentId)
      .eq('week_start', weekStartMonday)
      .maybeSingle(),
    // 성적: 전체 회차를 받아 주차 소속(weekScores)과 추이(trend)로 가공
    supabase
      .from('student_exam_scores')
      .select(
        'id, exam_name, exam_type, exam_date, subject, raw_score, grade, percentile, standard_score, memo',
      )
      .eq('student_id', studentId)
      .order('exam_date', { ascending: true }),
    // 멘토링/상담 결과: 확정된 신청 중 결과가 기록된 건(슬롯 날짜는 JS에서 주차 필터)
    supabase
      .from('mentoring_applications')
      .select(
        'status, slot:mentoring_slots!inner(date, type, mentors(name)), result:mentoring_results!inner(result_note)',
      )
      .eq('student_id', studentId)
      .eq('status', 'confirmed'),
  ]);

  const attendance = (attendanceRows ?? []) as AttendanceRecord[];
  const gradeStudyPeerAvgSeconds = (peerAvgRaw as number | null) ?? 0;
  const subjectsForWeek = (subjectRows ?? []).filter((sub) => {
    const subjectStart = new Date(sub.started_at);
    const subjectEnd = sub.ended_at
      ? new Date(sub.ended_at)
      : sub.is_current
        ? new Date()
        : subjectStart;
    return subjectEnd > periodStart && subjectStart < periodEnd;
  });

  const dayLabels = ['월', '화', '수', '목', '금', '토', '일'] as const;

  const dailyData: DailyReportData[] = weekDates.map((dateStr, idx) => {
    const { start, end } = getStudyDayBounds(dateStr);
    const { studySeconds, hasAttendance } = calculateStudySeconds(attendance, start, end);

    const dayFocus = (focusScores ?? []).filter((f) => {
      const t = new Date(f.recorded_at);
      return t >= start && t <= end;
    });
    const focusAvg =
      dayFocus.length > 0
        ? Math.round(
            (dayFocus.reduce((sum, f) => sum + Number(f.score), 0) / dayFocus.length) * 10,
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
  const attendanceRate = totalWeekdays > 0 ? Math.round((attendedDays / totalWeekdays) * 100) : 0;
  const absentRate = totalWeekdays > 0 ? Math.round((absentDays / totalWeekdays) * 100) : 0;

  const focusDays = dailyData.filter((d) => d.focusAvg !== null);
  const weeklyFocusAvg =
    focusDays.length > 0
      ? Math.round(
          (focusDays.reduce((sum, d) => sum + (d.focusAvg ?? 0), 0) / focusDays.length) * 10,
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
    }>,
  );

  const studyHoursWeekly = dailyData.reduce((sum, d) => sum + d.studySeconds, 0) / 3600;

  let counseling: CounselingReportData;

  if (counselingRow) {
    const fa = counselingRow.focus_avg !== null ? Number(counselingRow.focus_avg) : weeklyFocusAvg;
    const auto = await resolveCounselingAutoFill(
      supabase,
      branchId,
      fa,
      studentName,
      studyHoursWeekly,
    );
    counseling = {
      id: counselingRow.id,
      focusAvg: fa,
      studyFeedback: counselingRow.study_feedback ?? '',
      studyFeedbackFull: auto.studyFeedbackFull,
      guidanceNotes: counselingRow.guidance_notes ?? '',
      mentoringLetter: counselingRow.mentoring_letter ?? '',
      adminNotes: counselingRow.admin_notes,
      parentSummary: counselingRow.parent_summary ?? '',
      scoreLabel: auto.scoreLabel,
    };
  } else {
    const auto = await resolveCounselingAutoFill(
      supabase,
      branchId,
      weeklyFocusAvg,
      studentName,
      studyHoursWeekly,
    );
    counseling = {
      id: null,
      focusAvg: weeklyFocusAvg,
      studyFeedback: auto.studyFeedback,
      studyFeedbackFull: auto.studyFeedbackFull,
      guidanceNotes: '',
      mentoringLetter: '',
      adminNotes: null,
      parentSummary: auto.parentSummary,
      scoreLabel: auto.scoreLabel,
    };
  }

  // === 성적: weekScores(주차 소속) + trend(최근 6회차) ===
  const allExamRows = (examScoreRows ?? []) as Array<{
    id: string;
    exam_name: string;
    exam_type: string;
    exam_date: string;
    subject: string;
    raw_score: number | null;
    grade: number | null;
    percentile: number | null;
    standard_score: number | null;
    memo: string | null;
  }>;

  const toExamRow = (r: (typeof allExamRows)[number]): ExamScoreRow => ({
    id: r.id,
    examName: r.exam_name,
    examType: r.exam_type,
    examDate: r.exam_date,
    subject: r.subject,
    rawScore: r.raw_score !== null ? Number(r.raw_score) : null,
    grade: r.grade,
    percentile: r.percentile !== null ? Number(r.percentile) : null,
    standardScore: r.standard_score,
    memo: r.memo,
  });

  // 주차 소속: exam_date(date)가 이번 주 7일 문자열에 포함되는 행만
  const weekScores = allExamRows.filter((r) => weekDates.includes(r.exam_date)).map(toExamRow);

  // 추이: (exam_name, exam_date) 회차 그룹 → 최근 6회차
  const trendMap = new Map<string, ExamTrendPoint>();
  for (const r of allExamRows) {
    const key = `${r.exam_date}__${r.exam_name}`;
    let point = trendMap.get(key);
    if (!point) {
      point = { examName: r.exam_name, examDate: r.exam_date, bySubject: {} };
      trendMap.set(key, point);
    }
    point.bySubject[r.subject] = {
      grade: r.grade,
      percentile: r.percentile !== null ? Number(r.percentile) : null,
    };
  }
  const trend = Array.from(trendMap.values())
    .sort((a, b) => a.examDate.localeCompare(b.examDate))
    .slice(-6);
  const examSubjectSet = new Set<string>();
  for (const point of trend) {
    for (const subj of Object.keys(point.bySubject)) examSubjectSet.add(subj);
  }
  const examScores: ExamScoreReportData = {
    weekScores,
    trend,
    subjects: Array.from(examSubjectSet),
  };

  // === 멘토링/상담 결과: 슬롯 날짜가 이번 주에 속한 확정 건 ===
  // PostgREST 임베드는 관계를 배열로 추론하므로 unknown 경유 후 배열/객체 모두 정규화한다.
  type RawMentoringRow = {
    slot:
      | { date: string; type: string; mentors: { name: string } | { name: string }[] | null }
      | { date: string; type: string; mentors: { name: string } | { name: string }[] | null }[]
      | null;
    result: { result_note: string } | { result_note: string }[] | null;
  };
  const firstOf = <T>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

  const mentoringRecords: MentoringRecordItem[] = (
    (mentoringResultRows ?? []) as unknown as RawMentoringRow[]
  )
    .map((row) => {
      const slot = firstOf(row.slot);
      if (!slot || !weekDates.includes(slot.date)) return null;
      const result = firstOf(row.result);
      const mentor = firstOf(slot.mentors);
      return {
        date: slot.date,
        type: slot.type,
        mentorName: mentor?.name ?? null,
        resultNote: result?.result_note ?? '',
      };
    })
    .filter((r): r is MentoringRecordItem => r !== null && r.resultNote.trim() !== '')
    .sort((a, b) => a.date.localeCompare(b.date));

  const { start: calStart } = getCalendarWeekBoundsKST(weekStartMonday);
  const { endExclusive } = getCalendarWeekBoundsKST(weekStartMonday);
  const weekEndIso = new Date(endExclusive.getTime() - 1).toISOString();

  return {
    studentId,
    studentName,
    studentTypeName,
    seatNumber,
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
    gradeStudyPeerAvgSeconds,
    subjectByDay,
    points,
    counseling,
    examScores,
    mentoringRecords,
  };
}

export async function getWeeklyStudyTrend(
  studentId: string,
  weeks: number = 8,
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

  const currentMondayStr = formatDateKST(getWeekStart());
  const mondays: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(
      new Date(`${currentMondayStr}T12:00:00+09:00`).getTime() - i * 7 * 24 * 60 * 60 * 1000,
    );
    mondays.push(formatDateKST(d));
  }

  if (mondays.length === 0) return [];

  // 학습주 경계(월 06:00~다음 월 06:00). 이 bounds가 본인 순공 합산과 peer_bench_trend RPC에
  // 그대로 주입되므로, 캘린더주를 쓰면 일요일밤 세션이 잘려 추이가 과소집계된다.
  const weekBounds = mondays.map((m) => getStudyWeekBoundsFromMonday(m));
  const rangeStart = weekBounds[0]!.start;
  const rangeEnd = weekBounds[weekBounds.length - 1]!.endExclusive;

  // 본인 주차별 순공(my)은 본인 데이터라 RLS 클라이언트로 직접 조회해 계산한다.
  // 또래 최고치/상위30% 평균은 개인 식별이 불가한 집계라 DB 집계 RPC(peer_bench_trend)로 산출한다
  // (또래 전원 출결을 앱으로 가져오지 않는다).
  const [{ data: myAttendance }, { data: benchRows }] = await Promise.all([
    supabase
      .from('attendance')
      .select('type, timestamp')
      .eq('student_id', studentId)
      .gte('timestamp', rangeStart.toISOString())
      .lt('timestamp', rangeEnd.toISOString())
      .order('timestamp', { ascending: true }),
    supabase.rpc('peer_bench_trend', {
      p_student_type_id: studentTypeId,
      p_self_student: studentId,
      p_week_starts: weekBounds.map((b) => b.start.toISOString()),
      p_week_ends: weekBounds.map((b) => b.endExclusive.toISOString()),
    }),
  ]);

  const myRecs = (myAttendance ?? []) as AttendanceRecord[];
  const benchByIdx = new Map<number, { grade_max_seconds: number; peer_avg_seconds: number }>();
  for (const r of (benchRows ?? []) as Array<{
    week_idx: number;
    grade_max_seconds: number;
    peer_avg_seconds: number;
  }>) {
    benchByIdx.set(Number(r.week_idx), r);
  }

  const result: WeeklyTrendPoint[] = [];
  const n = mondays.length;

  for (let i = 0; i < n; i++) {
    const { start, endExclusive } = weekBounds[i]!;
    const weeksAgo = n - 1 - i;
    const weekLabel = weeksAgo === 0 ? '이번 주' : `${weeksAgo}주 전`;

    const mySeconds = weeklyStudySecondsFromAttendance(myRecs, start, endExclusive);
    const bench = benchByIdx.get(i + 1);

    result.push({
      weekLabel,
      weekStart: mondays[i]!,
      mySeconds,
      gradeMaxSeconds: Number(bench?.grade_max_seconds ?? 0),
      gradePeerAvgSeconds: Number(bench?.peer_avg_seconds ?? 0),
    });
  }

  return result;
}

export async function getCounselingReport(
  studentId: string,
  weekStartMonday: string,
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
      studyFeedbackFull: COUNSELING_TEMPLATES.getStudyFeedbackFull(null),
      guidanceNotes: '',
      mentoringLetter: '',
      adminNotes: null,
      parentSummary: '',
      scoreLabel: '',
    };
  }

  const { data: caller } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();
  const userType = caller?.user_type as string | undefined;

  if (!userType || !(await assertReportViewer(supabase, user.id, userType, studentId))) {
    return {
      id: null,
      focusAvg: null,
      studyFeedback: COUNSELING_TEMPLATES.getStudyFeedback(null),
      studyFeedbackFull: COUNSELING_TEMPLATES.getStudyFeedbackFull(null),
      guidanceNotes: '',
      mentoringLetter: '',
      adminNotes: null,
      parentSummary: '',
      scoreLabel: '',
    };
  }

  const { data: row } = await supabase
    .from('counseling_reports')
    .select('*')
    .eq('student_id', studentId)
    .eq('week_start', weekStartMonday)
    .maybeSingle();

  if (row) {
    const fa = row.focus_avg !== null ? Number(row.focus_avg) : null;
    const { data: spBranch } = await supabase
      .from('student_profiles')
      .select(
        `
        profiles!inner (
          name,
          branch_id
        )
      `,
      )
      .eq('id', studentId)
      .single();
    const prof = spBranch?.profiles as unknown as
      | {
          name: string;
          branch_id: string | null;
        }
      | undefined;
    const nameForRow = prof?.name ?? '학생';
    const bId = prof?.branch_id ?? null;

    const weekDates2 = getWeekDateStringsFromMondayKST(weekStartMonday);
    const { start: ps } = getStudyDayBounds(weekDates2[0]!);
    const { end: pe } = getStudyDayBounds(weekDates2[6]!);
    const { data: attRows2 } = await supabase
      .from('attendance')
      .select('type, timestamp, source, gate_name')
      .eq('student_id', studentId)
      .gte('timestamp', ps.toISOString())
      .lte('timestamp', pe.toISOString())
      .order('timestamp', { ascending: true });
    const att2 = (attRows2 ?? []) as AttendanceRecord[];
    let studySecWeek2 = 0;
    for (const dateStr of weekDates2) {
      const { start, end } = getStudyDayBounds(dateStr);
      studySecWeek2 += calculateStudySeconds(att2, start, end).studySeconds;
    }
    const studyHoursWeek2 = studySecWeek2 / 3600;

    const auto = await resolveCounselingAutoFill(supabase, bId, fa, nameForRow, studyHoursWeek2);

    return {
      id: row.id,
      focusAvg: fa,
      studyFeedback: row.study_feedback ?? '',
      studyFeedbackFull: auto.studyFeedbackFull,
      guidanceNotes: row.guidance_notes ?? '',
      mentoringLetter: row.mentoring_letter ?? '',
      adminNotes: row.admin_notes,
      parentSummary: row.parent_summary ?? '',
      scoreLabel: auto.scoreLabel,
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
      ? Math.round((focusList.reduce((s, f) => s + Number(f.score), 0) / focusList.length) * 10) /
        10
      : null;

  const { data: studentRow } = await supabase
    .from('student_profiles')
    .select(`profiles!inner (name)`)
    .eq('id', studentId)
    .single();

  const studentName = (studentRow?.profiles as unknown as { name: string })?.name ?? '학생';

  const { data: attRows } = await supabase
    .from('attendance')
    .select('type, timestamp, source, gate_name')
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

  const { data: spB } = await supabase
    .from('student_profiles')
    .select(`profiles!inner (branch_id)`)
    .eq('id', studentId)
    .single();
  const branchForStudent =
    (spB?.profiles as unknown as { branch_id: string | null })?.branch_id ?? null;

  const auto = await resolveCounselingAutoFill(
    supabase,
    branchForStudent,
    focusAvg,
    studentName,
    studyHoursWeekly,
  );

  return {
    id: null,
    focusAvg,
    studyFeedback: auto.studyFeedback,
    studyFeedbackFull: auto.studyFeedbackFull,
    guidanceNotes: '',
    mentoringLetter: '',
    adminNotes: null,
    parentSummary: auto.parentSummary,
    scoreLabel: auto.scoreLabel,
  };
}

export async function saveCounselingReport(params: {
  studentId: string;
  weekStart: string;
  focusAvg: number | null;
  studyFeedback: string;
  guidanceNotes: string;
  mentoringLetter: string;
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
      mentoring_letter: params.mentoringLetter || null,
      admin_notes: params.adminNotes || null,
      parent_summary: params.parentSummary,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'student_id,week_start' },
  );

  if (error) {
    console.error('saveCounselingReport', error);
    return { success: false, error: '저장에 실패했습니다.' };
  }

  revalidatePath('/admin/report');
  revalidatePath('/parent/report');
  revalidatePath('/student/report');
  return { success: true };
}

// === 성적(student_exam_scores) CRUD — 관리자 전용 ===

/** 한 학생의 전체 성적 회차를 시험일 내림차순으로 반환 (성적 관리 모달용) */
export async function getExamScores(studentId: string): Promise<ExamScoreRow[]> {
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

  const { data, error } = await supabase
    .from('student_exam_scores')
    .select(
      'id, exam_name, exam_type, exam_date, subject, raw_score, grade, percentile, standard_score, memo',
    )
    .eq('student_id', studentId)
    .order('exam_date', { ascending: false });

  if (error || !data) return [];

  return data.map((r) => ({
    id: r.id,
    examName: r.exam_name,
    examType: r.exam_type,
    examDate: r.exam_date,
    subject: r.subject,
    rawScore: r.raw_score !== null ? Number(r.raw_score) : null,
    grade: r.grade,
    percentile: r.percentile !== null ? Number(r.percentile) : null,
    standardScore: r.standard_score,
    memo: r.memo,
  }));
}

export interface SaveExamScoreParams {
  id?: string;
  studentId: string;
  examName: string;
  examType: string;
  examDate: string; // 'YYYY-MM-DD'
  subject: string;
  rawScore: number | null;
  grade: number | null;
  percentile: number | null;
  standardScore: number | null;
  memo: string | null;
}

/** 성적 1행 저장 — id 있으면 update, 없으면 insert */
export async function saveExamScore(
  params: SaveExamScoreParams,
): Promise<{ success: boolean; error?: string }> {
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

  const examName = params.examName.trim();
  const subject = params.subject.trim();
  if (!examName) return { success: false, error: '시험명을 입력해주세요.' };
  if (!params.examDate) return { success: false, error: '시험일을 입력해주세요.' };
  if (!subject) return { success: false, error: '과목을 입력해주세요.' };

  if (params.id) {
    const { error } = await supabase
      .from('student_exam_scores')
      .update({
        exam_name: examName,
        exam_type: params.examType || '모의고사',
        exam_date: params.examDate,
        subject,
        raw_score: params.rawScore,
        grade: params.grade,
        percentile: params.percentile,
        standard_score: params.standardScore,
        memo: params.memo || null,
      })
      .eq('id', params.id);
    if (error) {
      console.error('saveExamScore(update)', error);
      return { success: false, error: '저장에 실패했습니다.' };
    }
  } else {
    // branch_id 는 학생 프로필에서 채움 (RLS 일관성·표시용)
    const { data: studentProfile } = await supabase
      .from('profiles')
      .select('branch_id')
      .eq('id', params.studentId)
      .single();

    const { error } = await supabase.from('student_exam_scores').insert({
      student_id: params.studentId,
      branch_id: studentProfile?.branch_id ?? null,
      exam_name: examName,
      exam_type: params.examType || '모의고사',
      exam_date: params.examDate,
      subject,
      raw_score: params.rawScore,
      grade: params.grade,
      percentile: params.percentile,
      standard_score: params.standardScore,
      memo: params.memo || null,
      created_by: user.id,
    });
    if (error) {
      console.error('saveExamScore(insert)', error);
      return { success: false, error: '저장에 실패했습니다.' };
    }
  }

  revalidatePath('/admin/report');
  revalidatePath('/parent/report');
  revalidatePath('/student/report');
  return { success: true };
}

export async function deleteExamScore(id: string): Promise<{ success: boolean; error?: string }> {
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
    return { success: false, error: '관리자만 삭제할 수 있습니다.' };
  }

  const { error } = await supabase.from('student_exam_scores').delete().eq('id', id);
  if (error) {
    console.error('deleteExamScore', error);
    return { success: false, error: '삭제에 실패했습니다.' };
  }

  revalidatePath('/admin/report');
  revalidatePath('/parent/report');
  revalidatePath('/student/report');
  return { success: true };
}

export async function getStudentsForReport(branchId?: string): Promise<
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
    .is('withdrawn_at', null)
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
    typeNameById = Object.fromEntries((types ?? []).map((t) => [t.id, t.name]));
  }

  const spById = Object.fromEntries((sps ?? []).map((s) => [s.id, s]));

  return profiles.map((p) => {
    const sp = spById[p.id];
    const tid = sp?.student_type_id ?? null;
    return {
      id: p.id,
      name: p.name,
      studentTypeName: tid ? (typeNameById[tid] ?? null) : null,
      seatNumber: sp?.seat_number ?? null,
    };
  });
}

/** 관리자: 현재 주 지표로 상담 필드만 템플릿 재적용 (저장 전 폼용) */
export async function getCounselingAutoFillForWeek(
  studentId: string,
  weekStartMonday: string,
): Promise<{
  studyFeedback: string;
  studyFeedbackFull: string;
  guidanceNotes: string;
  parentSummary: string;
  scoreLabel: string;
  focusAvg: number | null;
} | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('user_type')
    .eq('id', user.id)
    .single();
  if (adminProfile?.user_type !== 'admin') return null;

  const { data: studentRow } = await supabase
    .from('student_profiles')
    .select(
      `
      profiles!inner (
        name,
        branch_id
      )
    `,
    )
    .eq('id', studentId)
    .single();
  if (!studentRow) return null;

  const prof = studentRow.profiles as unknown as {
    name: string;
    branch_id: string | null;
  };
  const studentName = prof.name;
  const branchId = prof.branch_id;

  const weekDates = getWeekDateStringsFromMondayKST(weekStartMonday);
  const { start: periodStart } = getStudyDayBounds(weekDates[0]!);
  const { end: periodEnd } = getStudyDayBounds(weekDates[6]!);

  const [{ data: attendanceRows }, { data: focusScores }] = await Promise.all([
    supabase
      .from('attendance')
      .select('type, timestamp, source, gate_name')
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
  ]);

  const attendance = (attendanceRows ?? []) as AttendanceRecord[];
  const dailyFocus = weekDates.map((dateStr) => {
    const { start, end } = getStudyDayBounds(dateStr);
    const dayFocus = (focusScores ?? []).filter((f) => {
      const t = new Date(f.recorded_at);
      return t >= start && t <= end;
    });
    const focusAvg =
      dayFocus.length > 0
        ? Math.round(
            (dayFocus.reduce((sum, f) => sum + Number(f.score), 0) / dayFocus.length) * 10,
          ) / 10
        : null;
    return focusAvg;
  });

  const focusDays = dailyFocus.filter((f): f is number => f !== null);
  const weeklyFocusAvg =
    focusDays.length > 0
      ? Math.round((focusDays.reduce((sum, d) => sum + d, 0) / focusDays.length) * 10) / 10
      : null;

  let studySecondsWeek = 0;
  for (const dateStr of weekDates) {
    const { start, end } = getStudyDayBounds(dateStr);
    studySecondsWeek += calculateStudySeconds(attendance, start, end).studySeconds;
  }
  const studyHoursWeekly = studySecondsWeek / 3600;

  const auto = await resolveCounselingAutoFill(
    supabase,
    branchId,
    weeklyFocusAvg,
    studentName,
    studyHoursWeekly,
  );

  return { ...auto, focusAvg: weeklyFocusAvg };
}

export type CounselingTemplateDTO = {
  id: string | null;
  branch_id: string;
  score: number;
  label: string;
  short_text: string;
  full_text: string;
};

export async function getCounselingTemplates(branchId: string): Promise<CounselingTemplateDTO[]> {
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

  const { data: rows } = await supabase
    .from('counseling_templates')
    .select('*')
    .eq('branch_id', branchId)
    .order('score', { ascending: true });

  const dbRows = (rows ?? []) as CounselingTemplate[];
  const byScore = new Map(dbRows.map((r) => [r.score, r]));
  const result: CounselingTemplateDTO[] = [];

  for (let s = 6; s <= 10; s++) {
    const r = byScore.get(s);
    const def = FOCUS_SCORE_TEMPLATES[s];
    if (!def) continue;
    if (r) {
      result.push({
        id: r.id,
        branch_id: r.branch_id,
        score: s,
        label: r.label,
        short_text: r.short_text,
        full_text: r.full_text,
      });
    } else {
      result.push({
        id: null,
        branch_id: branchId,
        score: s,
        label: def.label,
        short_text: def.short,
        full_text: def.full,
      });
    }
  }
  return result;
}

export async function saveCounselingTemplate(params: {
  branchId: string;
  score: number;
  label: string;
  shortText: string;
  fullText: string;
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

  const { error } = await supabase.from('counseling_templates').upsert(
    {
      branch_id: params.branchId,
      score: params.score,
      label: params.label,
      short_text: params.shortText,
      full_text: params.fullText,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'branch_id,score' },
  );

  if (error) {
    console.error('saveCounselingTemplate', error);
    return { success: false, error: '저장에 실패했습니다.' };
  }

  revalidatePath('/admin/report');
  return { success: true };
}

export async function initDefaultTemplates(
  branchId: string,
): Promise<{ success: boolean; error?: string }> {
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
    return { success: false, error: '관리자만 실행할 수 있습니다.' };
  }

  const { data: existing } = await supabase
    .from('counseling_templates')
    .select('id')
    .eq('branch_id', branchId)
    .limit(1);

  if (existing && existing.length > 0) {
    return { success: true };
  }

  const inserts = [6, 7, 8, 9, 10].map((s) => {
    const d = FOCUS_SCORE_TEMPLATES[s]!;
    return {
      branch_id: branchId,
      score: s,
      label: d.label,
      short_text: d.short,
      full_text: d.full,
    };
  });

  const { error } = await supabase.from('counseling_templates').insert(inserts);
  if (error) {
    console.error('initDefaultTemplates', error);
    return { success: false, error: '초기화에 실패했습니다.' };
  }

  revalidatePath('/admin/report');
  return { success: true };
}

export async function resetCounselingTemplatesToDefaults(
  branchId: string,
): Promise<{ success: boolean; error?: string }> {
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
    return { success: false, error: '관리자만 실행할 수 있습니다.' };
  }

  const { error: delErr } = await supabase
    .from('counseling_templates')
    .delete()
    .eq('branch_id', branchId);
  if (delErr) {
    console.error('resetCounselingTemplatesToDefaults', delErr);
    return { success: false, error: '삭제에 실패했습니다.' };
  }

  const inserts = [6, 7, 8, 9, 10].map((s) => {
    const d = FOCUS_SCORE_TEMPLATES[s]!;
    return {
      branch_id: branchId,
      score: s,
      label: d.label,
      short_text: d.short,
      full_text: d.full,
    };
  });

  const { error } = await supabase.from('counseling_templates').insert(inserts);
  if (error) {
    console.error('resetCounselingTemplatesToDefaults insert', error);
    return { success: false, error: '기본값 복원에 실패했습니다.' };
  }

  revalidatePath('/admin/report');
  return { success: true };
}

// ---------------------------------------------------------------------------
// 모의고사 옵션별 집계 (관리자 보고서/주문 현황)
// ---------------------------------------------------------------------------

export type MockExamOptionSummaryRow = {
  /** 그룹/옵션 조합 키 (정렬·표시용). 그룹명 + 옵션명을 ' · ' 로 결합 (선택 안 한 그룹은 제외). */
  combo_label: string;
  /** 결제 완료(paid) 주문 수 */
  paid_count: number;
  /** 결제 대기(pending) 주문 수 */
  pending_count: number;
};

/**
 * 한 모의고사 상품의 옵션 조합별 신청 통계를 반환한다.
 * meal_orders.option_selections JSONB 스냅샷을 풀어서 그룹/옵션 조합별 카운트 집계.
 * 스냅샷 기반이므로 옵션이 inactive 로 바뀌어도 이전 데이터는 유지된다.
 *
 * - 옵션 없는 상품(option_selections=null) 은 combo_label='-' 한 줄로 묶임.
 * - cancelled/refunded/failed 는 제외.
 */
export async function getMockExamOptionSummary(
  productId: string,
): Promise<MockExamOptionSummaryRow[]> {
  const supabase = await createClient();

  const { data: variants, error: vErr } = await supabase
    .from('meal_product_variants')
    .select('id')
    .eq('product_id', productId);
  if (vErr || !variants || variants.length === 0) return [];

  const variantIds = variants.map((v) => v.id as string);

  const { data: orders, error: oErr } = await supabase
    .from('meal_orders')
    .select('status, option_selections')
    .in('variant_id', variantIds)
    .in('status', ['paid', 'pending']);

  if (oErr) {
    console.error('[getMockExamOptionSummary]', oErr);
    return [];
  }

  const counts = new Map<string, { paid: number; pending: number }>();

  for (const row of orders ?? []) {
    const sel = (row as { option_selections: unknown }).option_selections;
    let label = '-';
    if (Array.isArray(sel) && sel.length > 0) {
      label = (sel as Array<{ group_name?: string; option_name?: string }>)
        .map((s) => `${s.group_name ?? ''}: ${s.option_name ?? ''}`)
        .join(' · ');
    }
    const status = (row as { status: 'paid' | 'pending' }).status;
    const bucket = counts.get(label) ?? { paid: 0, pending: 0 };
    if (status === 'paid') bucket.paid += 1;
    else if (status === 'pending') bucket.pending += 1;
    counts.set(label, bucket);
  }

  return Array.from(counts.entries())
    .map(([combo_label, { paid, pending }]) => ({
      combo_label,
      paid_count: paid,
      pending_count: pending,
    }))
    .sort((a, b) => {
      if (a.combo_label === '-' && b.combo_label !== '-') return 1;
      if (a.combo_label !== '-' && b.combo_label === '-') return -1;
      return a.combo_label.localeCompare(b.combo_label, 'ko');
    });
}
