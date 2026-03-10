import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DAY_CONFIG } from '@/lib/constants';

// Supabase 서비스 롤 클라이언트 (RLS 우회)
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// KST 오프셋 (UTC+9)
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// UTC Date를 KST 기준 YYYY-MM-DD 문자열로 변환
function formatKSTDate(utcDate: Date): string {
  const kst = new Date(utcDate.getTime() + KST_OFFSET_MS);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// KST 기준 이번 주 월요일 날짜(YYYY-MM-DD)를 반환
// weekParam이 있으면 해당 날짜가 속한 주의 월요일을 계산
function getThisWeekMondayKST(weekParam?: string): string {
  // KST 현재 날짜를 YYYY-MM-DD로 구한다
  let kstDateStr: string;
  if (weekParam) {
    kstDateStr = weekParam;
  } else {
    const now = new Date(Date.now() + KST_OFFSET_MS);
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, '0');
    const d = String(now.getUTCDate()).padStart(2, '0');
    kstDateStr = `${y}-${m}-${d}`;
  }
  // KST 해당 날짜의 요일 계산 (UTC noon으로 파싱해 DST 영향 방지)
  const refDate = new Date(`${kstDateStr}T12:00:00Z`);
  const day = refDate.getUTCDay(); // 0=일, 1=월, ...
  const diff = day - DAY_CONFIG.weekStartsOn; // 월요일(1)까지의 차이
  const adjustedDiff = diff < 0 ? diff + 7 : diff;
  refDate.setUTCDate(refDate.getUTCDate() - adjustedDiff);
  const y = refDate.getUTCFullYear();
  const m = String(refDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(refDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// KST 기준 주 시작일(월요일 00:00 KST = 일요일 15:00 UTC)을 UTC Date로 반환
// weekParam 있음: 해당 날짜(YYYY-MM-DD)가 속한 주를 직접 처리
// weekParam 없음: 지난 주(오늘 기준 이전 주)를 처리
function getTargetWeekStartKST(weekParam?: string): Date {
  if (weekParam) {
    const mondayKST = getThisWeekMondayKST(weekParam);
    return new Date(`${mondayKST}T00:00:00+09:00`);
  } else {
    const todayMondayKST = getThisWeekMondayKST();
    const thisWeekStart = new Date(`${todayMondayKST}T00:00:00+09:00`);
    return new Date(thisWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
}

// 주간 날짜 배열 생성 (KST 기준 YYYY-MM-DD)
function getWeekDates(weekStartUTC: Date): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStartUTC.getTime() + i * 24 * 60 * 60 * 1000);
    dates.push(formatKSTDate(d));
  }
  return dates;
}

// 출석 기록에서 학습 시간(분) 계산
function calculateStudyMinutes(
  attendance: Array<{ type: string; timestamp: string }>,
  weekStart: Date,
  weekEnd: Date
): number {
  let totalMinutes = 0;
  let checkInTime: Date | null = null;

  // 타임스탬프 순으로 정렬
  const sorted = [...attendance].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const record of sorted) {
    const timestamp = new Date(record.timestamp);
    
    // 해당 주 범위 내의 기록만 처리
    if (timestamp < weekStart || timestamp >= weekEnd) continue;

    switch (record.type) {
      case 'check_in':
        checkInTime = timestamp;
        break;
      case 'check_out':
        if (checkInTime) {
          totalMinutes += (timestamp.getTime() - checkInTime.getTime()) / (1000 * 60);
          checkInTime = null;
        }
        break;
      case 'break_start':
        if (checkInTime) {
          totalMinutes += (timestamp.getTime() - checkInTime.getTime()) / (1000 * 60);
          checkInTime = null;
        }
        break;
      case 'break_end':
        checkInTime = timestamp;
        break;
    }
  }

  return Math.floor(totalMinutes);
}

// 투트랙 주간 목표 설정 반환 타입
interface WeeklyGoalResult {
  goalMinutes: number;           // 목표 시간 (분)
  rewardPoints: number;          // 목표 달성 시 상점
  minimumMinutes: number;        // 최소 시간 (분)
  minimumPenaltyPoints: number;  // 최소 미달 시 벌점
}

// 학생의 주간 목표시간 계산 (날짜 타입별 가중 평균) - 투트랙 지원
async function calculateWeeklyGoalMinutes(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  studentTypeId: string,
  branchId: string,
  weekDates: string[],
  defaultGoalHours: number
): Promise<WeeklyGoalResult> {
  // 해당 주의 날짜별 date_type 조회
  const { data: dateAssignments } = await supabase
    .from('date_assignments')
    .select('date, date_type_id')
    .eq('branch_id', branchId)
    .in('date', weekDates);

  // 날짜별 date_type_id 맵 생성
  const dateTypeMap = new Map<string, string>();
  dateAssignments?.forEach((da) => {
    dateTypeMap.set(da.date, da.date_type_id);
  });

  // 학생 타입의 날짜 타입별 목표 설정 조회 (투트랙 필드 포함)
  const { data: goalSettings } = await supabase
    .from('weekly_goal_settings')
    .select('date_type_id, weekly_goal_hours, reward_points, minimum_hours, minimum_penalty_points')
    .eq('student_type_id', studentTypeId);

  // 날짜 타입별 설정 맵 생성
  const settingsMap = new Map<
    string,
    {
      weekly_goal_hours: number;
      reward_points: number;
      minimum_hours: number;
      minimum_penalty_points: number;
    }
  >();
  goalSettings?.forEach((gs) => {
    settingsMap.set(gs.date_type_id, {
      weekly_goal_hours: gs.weekly_goal_hours,
      reward_points: gs.reward_points,
      minimum_hours: gs.minimum_hours || 0,
      minimum_penalty_points: gs.minimum_penalty_points || 0,
    });
  });

  // 날짜 타입별 일수 카운트 및 목표시간/상벌점 합산
  let totalGoalHours = 0;
  let totalRewardPoints = 0;
  let totalMinimumHours = 0;
  let totalMinimumPenaltyPoints = 0;
  let assignedDays = 0;

  for (const date of weekDates) {
    const dateTypeId = dateTypeMap.get(date);
    if (dateTypeId && settingsMap.has(dateTypeId)) {
      const setting = settingsMap.get(dateTypeId)!;
      // 해당 날짜 타입의 목표시간을 7로 나눈 값 (일일 목표)
      totalGoalHours += setting.weekly_goal_hours / 7;
      totalRewardPoints += setting.reward_points / 7;
      totalMinimumHours += setting.minimum_hours / 7;
      totalMinimumPenaltyPoints += setting.minimum_penalty_points / 7;
      assignedDays++;
    }
  }

  // 설정이 있으면 가중 평균 사용
  if (assignedDays === 7) {
    return {
      goalMinutes: Math.round(totalGoalHours * 60),
      rewardPoints: Math.round(totalRewardPoints),
      minimumMinutes: Math.round(totalMinimumHours * 60),
      minimumPenaltyPoints: Math.round(totalMinimumPenaltyPoints),
    };
  } else if (assignedDays > 0) {
    // 일부만 설정된 경우
    const unassignedDays = 7 - assignedDays;
    const dailyDefault = defaultGoalHours / 7;
    const finalGoalHours = totalGoalHours + dailyDefault * unassignedDays;
    return {
      goalMinutes: Math.round(finalGoalHours * 60),
      rewardPoints: Math.round(totalRewardPoints * 7 / assignedDays),
      minimumMinutes: Math.round(totalMinimumHours * 60 * 7 / assignedDays),
      minimumPenaltyPoints: Math.round(totalMinimumPenaltyPoints * 7 / assignedDays),
    };
  } else {
    // 설정이 없으면 기본값 사용 (투트랙 미적용)
    return {
      goalMinutes: defaultGoalHours * 60,
      rewardPoints: 1,
      minimumMinutes: 0,
      minimumPenaltyPoints: 0,
    };
  }
}

export async function GET(request: Request) {
  // 1. Cron secret 검증
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ?week=YYYY-MM-DD 파라미터: 해당 주차(월요일 날짜)를 직접 지정하여 재계산
  // 예) ?week=2026-03-02 → 3/2(월)~3/8(일) 주차 처리
  // 파라미터 없으면 기존처럼 지난 주 자동 계산
  const url = new URL(request.url);
  const weekParam = url.searchParams.get('week') ?? undefined;

  const supabase = getSupabaseAdmin();
  const results: {
    processed: number;
    rewarded: number;
    penalized: number;
    neutral: number;  // 투트랙: 중간 (상벌점 없음)
    skipped: number;
    errors: string[];
  } = {
    processed: 0,
    rewarded: 0,
    penalized: 0,
    neutral: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // 2. 처리할 주 시작일/종료일 계산 (KST 기준)
    const lastWeekStart = getTargetWeekStartKST(weekParam);
    const lastWeekEnd = new Date(lastWeekStart);
    lastWeekEnd.setUTCDate(lastWeekEnd.getUTCDate() + 7);
    
    const weekStartStr = formatKSTDate(lastWeekStart);
    const weekDates = getWeekDates(lastWeekStart);

    // 3. 모든 학생 조회 (타입 정보 포함)
    const { data: students, error: studentsError } = await supabase
      .from('student_profiles')
      .select(`
        id,
        student_type_id,
        student_types (
          weekly_goal_hours
        )
      `)
      .not('student_type_id', 'is', null);

    if (studentsError) {
      throw new Error(`Failed to fetch students: ${studentsError.message}`);
    }

    if (!students || students.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No students to process',
        results,
      });
    }

    // 4. 학생별 지점 정보 조회
    const studentIds = students.map((s) => s.id);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, branch_id')
      .in('id', studentIds);

    const branchMap = new Map<string, string>();
    profiles?.forEach((p) => {
      if (p.branch_id) {
        branchMap.set(p.id, p.branch_id);
      }
    });

    // 5. 이미 처리된 학생 확인
    const { data: existingHistory } = await supabase
      .from('weekly_point_history')
      .select('student_id')
      .eq('week_start', weekStartStr);

    const processedSet = new Set(existingHistory?.map((h) => h.student_id) || []);

    // 6. 학생별 출석 기록 조회
    // PostgREST max-rows 제한(기본 1000행)을 우회하기 위해 학생 1명씩 개별 조회
    const attendanceByStudent = new Map<
      string,
      Array<{ type: string; timestamp: string }>
    >();
    for (const studentId of studentIds) {
      const { data: studentAttendance } = await supabase
        .from('attendance')
        .select('type, timestamp')
        .eq('student_id', studentId)
        .gte('timestamp', lastWeekStart.toISOString())
        .lt('timestamp', lastWeekEnd.toISOString())
        .order('timestamp', { ascending: true })
        .limit(10000);
      if (studentAttendance && studentAttendance.length > 0) {
        attendanceByStudent.set(
          studentId,
          studentAttendance.map((a) => ({ type: a.type, timestamp: a.timestamp }))
        );
      }
    }

    // 7. 각 학생별 처리
    for (const student of students) {
      // 이미 처리된 경우 스킵
      if (processedSet.has(student.id)) {
        results.skipped++;
        continue;
      }

      const branchId = branchMap.get(student.id);
      if (!branchId || !student.student_type_id) {
        results.skipped++;
        continue;
      }

      try {
        // 학생 타입의 기본 목표시간
        const studentType = student.student_types as unknown as {
          weekly_goal_hours: number;
        } | null;
        const defaultGoalHours = studentType?.weekly_goal_hours || 40;

        // 목표시간 및 상벌점 계산 (투트랙 지원)
        const { goalMinutes, rewardPoints, minimumMinutes, minimumPenaltyPoints } =
          await calculateWeeklyGoalMinutes(
            supabase,
            student.student_type_id,
            branchId,
            weekDates,
            defaultGoalHours
          );

        // 실제 학습시간 계산
        const attendance = attendanceByStudent.get(student.id) || [];
        const totalStudyMinutes = calculateStudyMinutes(
          attendance,
          lastWeekStart,
          lastWeekEnd
        );

        // 투트랙 판단
        const goalHours = Math.floor(goalMinutes / 60);
        const minimumHours = Math.floor(minimumMinutes / 60);
        const studyHours = Math.floor(totalStudyMinutes / 60);
        
        const isGoalAchieved = totalStudyMinutes >= goalMinutes;
        const isBelowMinimum = minimumMinutes > 0 && totalStudyMinutes < minimumMinutes;
        
        // 투트랙: 목표 달성 → 상점, 최소 미달 → 벌점, 중간 → 없음
        let pointType: 'reward' | 'penalty' | null = null;
        let pointAmount = 0;
        let reason = '';
        let notificationTitle = '';
        
        if (isGoalAchieved) {
          // 목표 달성 → 상점
          pointType = 'reward';
          pointAmount = rewardPoints;
          reason = `주간 목표 달성 (${studyHours}시간/${goalHours}시간)`;
          notificationTitle = '주간 목표 달성! 상점이 부여되었습니다';
        } else if (isBelowMinimum) {
          // 최소 미달 → 벌점
          pointType = 'penalty';
          pointAmount = minimumPenaltyPoints;
          reason = `주간 최소시간 미달 (${studyHours}시간/${minimumHours}시간 미만)`;
          notificationTitle = '주간 최소시간 미달로 벌점이 부여되었습니다';
        } else {
          // 중간 → 상벌점 없음
          reason = `주간 학습 (${studyHours}시간, 목표: ${goalHours}시간, 최소: ${minimumHours}시간)`;
        }

        let pointId: string | null = null;

        // 상벌점이 있는 경우만 points 테이블에 저장
        if (pointType && pointAmount > 0) {
          const { data: point, error: pointError } = await supabase
            .from('points')
            .insert({
              student_id: student.id,
              admin_id: null,
              type: pointType,
              amount: pointAmount,
              reason,
              is_auto: true,
            })
            .select('id')
            .single();

          if (pointError) {
            results.errors.push(`Student ${student.id}: ${pointError.message}`);
            continue;
          }
          pointId = point.id;

          // 알림 생성 (상벌점이 있는 경우만)
          await supabase.from('student_notifications').insert({
            student_id: student.id,
            type: 'point',
            title: notificationTitle,
            message: reason,
            link: '/student/points',
          });
        }

        // weekly_point_history에 기록 (모든 경우)
        const { error: historyError } = await supabase
          .from('weekly_point_history')
          .insert({
            student_id: student.id,
            week_start: weekStartStr,
            total_study_minutes: totalStudyMinutes,
            goal_minutes: goalMinutes,
            is_achieved: isGoalAchieved,
            point_id: pointId,
          });

        if (historyError) {
          results.errors.push(
            `History for ${student.id}: ${historyError.message}`
          );
          continue;
        }

        results.processed++;
        if (isGoalAchieved) {
          results.rewarded++;
        } else if (isBelowMinimum) {
          results.penalized++;
        } else {
          results.neutral++;
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Unknown error';
        results.errors.push(`Student ${student.id}: ${errorMessage}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.processed} students`,
      weekStart: weekStartStr,
      results,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('Weekly points cron error:', errorMessage);

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
