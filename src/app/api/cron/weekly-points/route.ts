import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DAY_CONFIG } from '@/lib/constants';

// Supabase 서비스 롤 클라이언트 (RLS 우회)
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// 주의 시작일 계산 (일요일 기준)
function getWeekStart(date: Date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day - DAY_CONFIG.weekStartsOn;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// 지난 주 시작일 계산
function getLastWeekStart(): Date {
  const thisWeekStart = getWeekStart();
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  return lastWeekStart;
}

// 주간 날짜 배열 생성
function getWeekDates(weekStart: Date): string[] {
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    dates.push(date.toISOString().split('T')[0]);
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

// 학생의 주간 목표시간 계산 (날짜 타입별 가중 평균)
async function calculateWeeklyGoalMinutes(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  studentTypeId: string,
  branchId: string,
  weekDates: string[],
  defaultGoalHours: number
): Promise<{ goalMinutes: number; rewardPoints: number; penaltyPoints: number }> {
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

  // 학생 타입의 날짜 타입별 목표 설정 조회
  const { data: goalSettings } = await supabase
    .from('weekly_goal_settings')
    .select('date_type_id, weekly_goal_hours, reward_points, penalty_points')
    .eq('student_type_id', studentTypeId);

  // 날짜 타입별 설정 맵 생성
  const settingsMap = new Map<
    string,
    { weekly_goal_hours: number; reward_points: number; penalty_points: number }
  >();
  goalSettings?.forEach((gs) => {
    settingsMap.set(gs.date_type_id, {
      weekly_goal_hours: gs.weekly_goal_hours,
      reward_points: gs.reward_points,
      penalty_points: gs.penalty_points,
    });
  });

  // 날짜 타입별 일수 카운트 및 목표시간/상벌점 합산
  let totalGoalHours = 0;
  let totalRewardPoints = 0;
  let totalPenaltyPoints = 0;
  let assignedDays = 0;

  for (const date of weekDates) {
    const dateTypeId = dateTypeMap.get(date);
    if (dateTypeId && settingsMap.has(dateTypeId)) {
      const setting = settingsMap.get(dateTypeId)!;
      // 해당 날짜 타입의 목표시간을 7로 나눈 값 (일일 목표)
      totalGoalHours += setting.weekly_goal_hours / 7;
      totalRewardPoints += setting.reward_points / 7;
      totalPenaltyPoints += setting.penalty_points / 7;
      assignedDays++;
    }
  }

  // 설정이 있으면 가중 평균 사용
  if (assignedDays === 7) {
    return {
      goalMinutes: Math.round(totalGoalHours * 60),
      rewardPoints: Math.round(totalRewardPoints * 7),
      penaltyPoints: Math.round(totalPenaltyPoints * 7),
    };
  } else if (assignedDays > 0) {
    // 일부만 설정된 경우
    const unassignedDays = 7 - assignedDays;
    const dailyDefault = defaultGoalHours / 7;
    const finalGoalHours = totalGoalHours + dailyDefault * unassignedDays;
    return {
      goalMinutes: Math.round(finalGoalHours * 60),
      rewardPoints: Math.round(totalRewardPoints * 7 / assignedDays),
      penaltyPoints: Math.round(totalPenaltyPoints * 7 / assignedDays),
    };
  } else {
    // 설정이 없으면 기본값 사용
    return {
      goalMinutes: defaultGoalHours * 60,
      rewardPoints: 1,
      penaltyPoints: 1,
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

  const supabase = getSupabaseAdmin();
  const results: {
    processed: number;
    rewarded: number;
    penalized: number;
    skipped: number;
    errors: string[];
  } = {
    processed: 0,
    rewarded: 0,
    penalized: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // 2. 지난 주 시작일/종료일 계산
    const lastWeekStart = getLastWeekStart();
    const lastWeekEnd = new Date(lastWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() + 7);
    
    const weekStartStr = lastWeekStart.toISOString().split('T')[0];
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

    // 6. 학생별 출석 기록 일괄 조회
    const { data: allAttendance } = await supabase
      .from('attendance')
      .select('student_id, type, timestamp')
      .in('student_id', studentIds)
      .gte('timestamp', lastWeekStart.toISOString())
      .lt('timestamp', lastWeekEnd.toISOString())
      .order('timestamp', { ascending: true });

    // 학생별 출석 기록 그룹화
    const attendanceByStudent = new Map<
      string,
      Array<{ type: string; timestamp: string }>
    >();
    allAttendance?.forEach((a) => {
      if (!attendanceByStudent.has(a.student_id)) {
        attendanceByStudent.set(a.student_id, []);
      }
      attendanceByStudent.get(a.student_id)!.push({
        type: a.type,
        timestamp: a.timestamp,
      });
    });

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

        // 목표시간 및 상벌점 계산
        const { goalMinutes, rewardPoints, penaltyPoints } =
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

        // 달성 여부 판단
        const isAchieved = totalStudyMinutes >= goalMinutes;

        // 포인트 부여
        const pointType = isAchieved ? 'reward' : 'penalty';
        const pointAmount = isAchieved ? rewardPoints : penaltyPoints;
        const reason = isAchieved
          ? `주간 목표 달성 (${Math.floor(totalStudyMinutes / 60)}시간/${Math.floor(goalMinutes / 60)}시간)`
          : `주간 목표 미달 (${Math.floor(totalStudyMinutes / 60)}시간/${Math.floor(goalMinutes / 60)}시간)`;

        // points 테이블에 저장
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

        // weekly_point_history에 기록
        const { error: historyError } = await supabase
          .from('weekly_point_history')
          .insert({
            student_id: student.id,
            week_start: weekStartStr,
            total_study_minutes: totalStudyMinutes,
            goal_minutes: goalMinutes,
            is_achieved: isAchieved,
            point_id: point.id,
          });

        if (historyError) {
          results.errors.push(
            `History for ${student.id}: ${historyError.message}`
          );
          continue;
        }

        // 학생 알림 생성
        await supabase.from('student_notifications').insert({
          student_id: student.id,
          type: 'point',
          title: isAchieved
            ? '주간 목표 달성! 상점이 부여되었습니다'
            : '주간 목표 미달로 벌점이 부여되었습니다',
          message: reason,
          link: '/student/points',
        });

        results.processed++;
        if (isAchieved) {
          results.rewarded++;
        } else {
          results.penalized++;
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
