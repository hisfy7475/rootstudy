// 주간 목표시간/상벌점 계산의 단일 출처(SSOT).
//
// 한 학습주(월~일)의 각 날짜에 배정된 date_type을 보고, 학생 타입의 날짜타입별
// weekly_goal_settings(주간 목표·상점·최소시간·벌점)를 합산해 그 주의 목표/상벌점을 낸다.
//
// 과거에는 이 로직이 학생 화면(src/lib/actions/student.ts)과 상벌점 크론
// (src/app/api/cron/weekly-points/route.ts)에 각각 복제돼 있었고 서로 미묘하게 달랐다
// (특히 부분배정 주에서 목표만 "기본값"으로 부풀려져 25→27, 40→49 버그 발생).
// 이 모듈로 통합해 양쪽이 동일한 공식을 쓰게 한다.
//
// 핵심 규칙(부분배정 주):
//   배정된 날들의 일일치(값/7)를 합산한 뒤 scale = 7/assignedDays 를 곱해 한 주로 환산한다.
//   즉 미배정일은 "기본값"이 아니라 "배정된 날들의 평균"을 상속한다. assignedDays===7이면
//   scale=1 이라 완전배정과 동일(무회귀). assignedDays===0 일 때만 기본값으로 폴백한다.

import type { SupabaseClient } from '@supabase/supabase-js';

// 두 호출처(요청 스코프 createServerClient<any> / 크론 service-role createClient)의
// 클라이언트가 모두 <any> 제네릭이라, 캐스팅 없이 받기 위해 구조적 any 클라이언트로 둔다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WeeklyGoalDbClient = SupabaseClient<any, 'public', any>;

export interface WeeklyGoalResult {
  goalMinutes: number; // 목표 시간 (분)
  rewardPoints: number; // 목표 달성 시 상점
  minimumMinutes: number; // 최소 시간 (분)
  minimumPenaltyPoints: number; // 최소 미달 시 벌점
}

export interface WeeklyGoalSettingRow {
  weekly_goal_hours: number;
  reward_points: number;
  minimum_hours: number;
  minimum_penalty_points: number;
}

/**
 * 순수 계산. IO 없음 → 단위 검증 용이.
 * @param weekDates 월~일 7개 날짜 문자열(YYYY-MM-DD)
 * @param dateTypeByDate date(YYYY-MM-DD) -> date_type_id
 * @param settingsByDateType date_type_id -> 목표/상벌점 설정
 * @param defaultGoalHours 배정일이 0일 때만 쓰는 폴백 목표시간(학생타입 기본값)
 */
export function computeWeeklyGoal(
  weekDates: string[],
  dateTypeByDate: Map<string, string>,
  settingsByDateType: Map<string, WeeklyGoalSettingRow>,
  defaultGoalHours: number,
): WeeklyGoalResult {
  let totalGoalHours = 0;
  let totalRewardPoints = 0;
  let totalMinimumHours = 0;
  let totalMinimumPenaltyPoints = 0;
  let assignedDays = 0;

  for (const date of weekDates) {
    const dateTypeId = dateTypeByDate.get(date);
    if (dateTypeId && settingsByDateType.has(dateTypeId)) {
      const setting = settingsByDateType.get(dateTypeId)!;
      // 해당 날짜 타입의 주간 목표/상벌점을 7로 나눈 값(일일치)
      totalGoalHours += setting.weekly_goal_hours / 7;
      totalRewardPoints += setting.reward_points / 7;
      totalMinimumHours += setting.minimum_hours / 7;
      totalMinimumPenaltyPoints += setting.minimum_penalty_points / 7;
      assignedDays++;
    }
  }

  // 배정일이 하나도 없으면 기본값 폴백(투트랙 미적용)
  if (assignedDays === 0) {
    return {
      goalMinutes: defaultGoalHours * 60,
      rewardPoints: 1,
      minimumMinutes: 0,
      minimumPenaltyPoints: 0,
    };
  }

  // 배정된 날들의 평균을 한 주(7일)로 환산. assignedDays===7이면 scale=1(완전배정과 동일).
  const scale = 7 / assignedDays;
  return {
    goalMinutes: Math.round(totalGoalHours * scale * 60),
    rewardPoints: Math.round(totalRewardPoints * scale),
    minimumMinutes: Math.round(totalMinimumHours * scale * 60),
    minimumPenaltyPoints: Math.round(totalMinimumPenaltyPoints * scale),
  };
}

/**
 * weekly_goal_settings + date_assignments를 조회해 그 주의 목표/상벌점을 계산한다.
 * 학생 화면과 상벌점 크론이 공유한다.
 */
export async function fetchWeeklyGoal(
  supabase: WeeklyGoalDbClient,
  studentTypeId: string,
  branchId: string,
  weekDates: string[],
  defaultGoalHours: number,
): Promise<WeeklyGoalResult> {
  // 해당 주의 날짜별 date_type 조회 (date_assignments는 (branch_id, date) UNIQUE)
  const { data: dateAssignments } = await supabase
    .from('date_assignments')
    .select('date, date_type_id')
    .eq('branch_id', branchId)
    .in('date', weekDates);

  const dateTypeByDate = new Map<string, string>();
  dateAssignments?.forEach((da: { date: string; date_type_id: string }) => {
    dateTypeByDate.set(da.date, da.date_type_id);
  });

  // 학생 타입의 날짜 타입별 목표/상벌점 설정 조회
  const { data: goalSettings } = await supabase
    .from('weekly_goal_settings')
    .select('date_type_id, weekly_goal_hours, reward_points, minimum_hours, minimum_penalty_points')
    .eq('student_type_id', studentTypeId);

  const settingsByDateType = new Map<string, WeeklyGoalSettingRow>();
  goalSettings?.forEach(
    (gs: {
      date_type_id: string;
      weekly_goal_hours: number;
      reward_points: number;
      minimum_hours: number | null;
      minimum_penalty_points: number | null;
    }) => {
      settingsByDateType.set(gs.date_type_id, {
        weekly_goal_hours: gs.weekly_goal_hours,
        reward_points: gs.reward_points,
        minimum_hours: gs.minimum_hours || 0,
        minimum_penalty_points: gs.minimum_penalty_points || 0,
      });
    },
  );

  return computeWeeklyGoal(weekDates, dateTypeByDate, settingsByDateType, defaultGoalHours);
}
