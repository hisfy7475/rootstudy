import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { DAY_CONFIG } from '@/lib/constants';
import {
  formatDateKST,
  getStudyWeekBoundsFromMonday,
  getWeekDateStringsFromMondayKST,
} from '@/lib/utils';
import { notifyPointsGranted, notifyPenaltyThreshold } from '@/lib/actions/notification';
import { sumStudySeconds } from '@/lib/study-time';
import { fetchWeeklyGoal } from '@/lib/study/weekly-goal';

// Supabase 서비스 롤 클라이언트 (RLS 우회)
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

// KST 오프셋 (UTC+9)
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

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

// 출석 기록에서 학습 시간(분) 계산.
// 정본 세션 합산(extractStudySessions/sumStudySeconds)을 그대로 사용한다.
// weekEnd(학습주 endExclusive)로 미닫힘 세션을 cap하며, 입력 attendance는
// 학습주 창으로 이미 fetch된 것이라 별도 레코드 필터가 필요 없다.
// (과거의 "캘린더주 경계 + 레코드 필터" 방식은 일요일밤 세션을 잘라먹는 버그였다.)
function calculateStudyMinutes(
  attendance: Array<{
    type: string;
    timestamp: string;
    source?: string | null;
    gate_name?: string | null;
  }>,
  weekEnd: Date,
): number {
  return Math.floor(sumStudySeconds(attendance, weekEnd) / 60);
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
    neutral: number; // 투트랙: 중간 (상벌점 없음)
    skipped: number;
    skippedAlreadyProcessed: number;
    skippedNoBranchOrType: number;
    skippedJoinedAfterWeek: number;
    skippedNoCheckIn: number;
    errors: string[];
  } = {
    processed: 0,
    rewarded: 0,
    penalized: 0,
    neutral: 0,
    skipped: 0,
    skippedAlreadyProcessed: 0,
    skippedNoBranchOrType: 0,
    skippedJoinedAfterWeek: 0,
    skippedNoCheckIn: 0,
    errors: [],
  };

  try {
    // 2. 처리할 주 시작일/종료일 계산.
    //    월요일 라벨(weekStartStr)은 종전과 동일하게 도출하고, 집계 경계는 학습주
    //    [월 06:00 KST, 다음 월 06:00 KST)를 사용한다. (캘린더주 00:00 경계는 일요일밤
    //    세션을 잘라먹어 순공이 과소집계되는 버그였다.)
    const targetMonday = getTargetWeekStartKST(weekParam);
    const weekStartStr = formatDateKST(targetMonday);
    const { start: lastWeekStart, endExclusive: lastWeekEnd } =
      getStudyWeekBoundsFromMonday(weekStartStr);
    const weekDates = getWeekDateStringsFromMondayKST(weekStartStr);

    // 3. 모든 학생 조회 (타입/지점/가입일/첫등원일 포함, 퇴원생 제외)
    //    퇴원 시점이 정산 대상 주 중간이더라도 그 주의 신규 정산에서 제외한다.
    //    이미 처리된 기존 weekly_point_history 행은 그대로 보존된다.
    //    first_check_in_at 은 머터리얼라이즈 컬럼(attendance INSERT 트리거로 자동 세팅).
    const { data: students, error: studentsError } = await supabase
      .from('student_profiles')
      .select(
        `
        id,
        student_type_id,
        first_check_in_at,
        student_types (
          weekly_goal_hours
        ),
        profiles!inner (
          name,
          branch_id,
          created_at,
          withdrawn_at
        )
      `,
      )
      .not('student_type_id', 'is', null)
      .is('profiles.withdrawn_at', null)
      .eq('profiles.is_approved', true);

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

    // 4. 학생별 지점 정보·가입일·첫등원일 매핑 (조인 결과 재사용)
    //    신규생 면제 판정은 first_check_in_at 기준. created_at(가입일) 은
    //    정산 주 이후 가입자 skip 안전망 용도로만 남김.
    const studentIds = students.map((s) => s.id);
    const branchMap = new Map<string, string>();
    const joinedAtMap = new Map<string, Date>();
    const firstCheckInMap = new Map<string, Date | null>();
    const nameMap = new Map<string, string>();
    students.forEach((s) => {
      const p = Array.isArray(s.profiles) ? s.profiles[0] : s.profiles;
      if (p?.branch_id) {
        branchMap.set(s.id, p.branch_id);
      }
      if (p?.created_at) {
        joinedAtMap.set(s.id, new Date(p.created_at));
      }
      if (p?.name) {
        nameMap.set(s.id, p.name);
      }
      firstCheckInMap.set(s.id, s.first_check_in_at ? new Date(s.first_check_in_at) : null);
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
      Array<{ type: string; timestamp: string; source: string | null; gate_name: string | null }>
    >();
    for (const studentId of studentIds) {
      const { data: studentAttendance } = await supabase
        .from('attendance')
        .select('type, timestamp, source, gate_name')
        .eq('student_id', studentId)
        .gte('timestamp', lastWeekStart.toISOString())
        .lt('timestamp', lastWeekEnd.toISOString())
        .order('timestamp', { ascending: true })
        .limit(10000);
      if (studentAttendance && studentAttendance.length > 0) {
        attendanceByStudent.set(
          studentId,
          studentAttendance.map((a) => ({
            type: a.type,
            timestamp: a.timestamp,
            source: a.source,
            gate_name: a.gate_name,
          })),
        );
      }
    }

    // 7. 각 학생별 처리
    for (const student of students) {
      // 이미 처리된 경우 스킵
      if (processedSet.has(student.id)) {
        results.skipped++;
        results.skippedAlreadyProcessed++;
        continue;
      }

      const branchId = branchMap.get(student.id);
      if (!branchId || !student.student_type_id) {
        results.skipped++;
        results.skippedNoBranchOrType++;
        continue;
      }

      // 정산 대상 주차가 끝난 뒤(예: 같은 날 새벽~오전) 가입한 학생은 정산 제외 (안전망).
      const joinedAt = joinedAtMap.get(student.id);
      if (joinedAt !== undefined && joinedAt >= lastWeekEnd) {
        results.skipped++;
        results.skippedJoinedAfterWeek++;
        continue;
      }
      if (joinedAt === undefined) {
        console.warn(`weekly-points: student ${student.id} has null created_at, treated as legacy`);
      }

      // 단계 6: 첫 등원일이 없는(미등원) 학생은 정산 자체 skip.
      // — 가입만 하고 안 나온 학생에게 최소시간 미달 벌점을 부과하는 건 불공정.
      const firstCheckIn = firstCheckInMap.get(student.id);
      if (!firstCheckIn) {
        results.skipped++;
        results.skippedNoCheckIn++;
        continue;
      }

      try {
        // 학생 타입의 기본 목표시간
        const studentType = student.student_types as unknown as {
          weekly_goal_hours: number;
        } | null;
        const defaultGoalHours = studentType?.weekly_goal_hours || 40;

        // 목표시간 및 상벌점 계산 (투트랙 지원, SSOT: src/lib/study/weekly-goal.ts)
        const { goalMinutes, rewardPoints, minimumMinutes, minimumPenaltyPoints } =
          await fetchWeeklyGoal(
            supabase,
            student.student_type_id,
            branchId,
            weekDates,
            defaultGoalHours,
          );

        // 실제 학습시간 계산
        const attendance = attendanceByStudent.get(student.id) || [];
        const totalStudyMinutes = calculateStudyMinutes(attendance, lastWeekEnd);

        // 투트랙 판단
        const goalHours = Math.floor(goalMinutes / 60);
        const minimumHours = Math.floor(minimumMinutes / 60);
        const studyHours = Math.floor(totalStudyMinutes / 60);

        const isGoalAchieved = totalStudyMinutes >= goalMinutes;
        const isBelowMinimum = minimumMinutes > 0 && totalStudyMinutes < minimumMinutes;

        // 단계 6: 첫 등원일 기준 신규생 면제 — 정산 주 안에 첫 등원한 학생은 벌점 면제.
        // (가입일 기준 면제는 가입만 하고 안 나온 학생도 면제하는 비합리적 결과를 만들기에 변경.)
        const isNewThisWeek = firstCheckIn >= lastWeekStart && firstCheckIn < lastWeekEnd;
        const applyPenalty = isBelowMinimum && !isNewThisWeek;

        // 투트랙: 목표 달성 → 상점, 최소 미달 → 벌점, 중간 → 없음
        let pointType: 'reward' | 'penalty' | null = null;
        let pointAmount = 0;
        let reason = '';

        if (isGoalAchieved) {
          // 목표 달성 → 상점
          pointType = 'reward';
          pointAmount = rewardPoints;
          reason = `주간 목표 달성 (${studyHours}시간/${goalHours}시간)`;
        } else if (applyPenalty) {
          // 최소 미달 → 벌점
          pointType = 'penalty';
          pointAmount = minimumPenaltyPoints;
          reason = `주간 최소시간 미달 (${studyHours}시간/${minimumHours}시간 미만)`;
        } else if (isNewThisWeek && isBelowMinimum) {
          // 신규 학생 첫 주 최소 미달 → 벌점 면제 (첫 등원일 기준)
          const firstCheckInStr = formatDateKST(firstCheckIn);
          reason = `주간 학습 (${studyHours}시간, 목표: ${goalHours}시간, 최소: ${minimumHours}시간, 첫 등원 ${firstCheckInStr} 신규 적응 기간 면제)`;
        } else {
          // 중간 → 상벌점 없음
          reason = `주간 학습 (${studyHours}시간, 목표: ${goalHours}시간, 최소: ${minimumHours}시간)`;
        }

        let pointId: string | null = null;

        // 상벌점이 있는 경우만 points 테이블에 저장
        if (pointType && pointAmount > 0) {
          if (pointType === 'penalty') {
            // 벌점은 반드시 임계 RPC 를 탄다.
            // 예전에는 여기서 points 에 직접 INSERT 해서 10/20/25 경고와 30점 상계·강제 퇴원
            // 판정을 통째로 우회했고, 주간 벌점만으로 30점을 넘긴 학생이 아무 통보 없이 방치됐다.
            const { data: rpcData, error: rpcError } = await supabase.rpc(
              'give_penalty_with_threshold_check',
              {
                p_student_id: student.id,
                p_admin_id: null,
                p_amount: pointAmount,
                p_reason: reason,
                p_preset_id: null,
                p_event_kind: 'auto_weekly',
              },
            );

            if (rpcError) {
              results.errors.push(`Student ${student.id}: ${rpcError.message}`);
              continue;
            }

            const rpcResult = rpcData as {
              point_id?: string;
              warnings?: Array<'warn_10' | 'warn_20' | 'warn_25'>;
              threshold?: Parameters<typeof notifyPenaltyThreshold>[0]['threshold'];
            } | null;
            pointId = rpcResult?.point_id ?? null;

            // ⚠️ await 필수 — fire-and-forget 이면 서버리스 핸들러가 응답 직후 동결돼
            // 알림이 유실된다. 특히 30점 자동 분류 시 관리자 알림이 이 경로로 나가는데,
            // 학생에게는 통보 게이트 때문에 아무것도 안 가므로 이게 유일한 통지 수단이다.
            await notifyPenaltyThreshold({
              studentId: student.id,
              warnings: rpcResult?.warnings ?? [],
              threshold: rpcResult?.threshold ?? null,
            }).catch((e) => console.error('[weekly-points] notifyPenaltyThreshold', e));
          } else {
            const { data: point, error: pointError } = await supabase
              .from('points')
              .insert({
                student_id: student.id,
                admin_id: null,
                type: pointType,
                amount: pointAmount,
                reason,
                is_auto: true,
                event_kind: 'auto_weekly',
              })
              .select('id')
              .single();

            if (pointError) {
              results.errors.push(`Student ${student.id}: ${pointError.message}`);
              continue;
            }
            pointId = point.id;
          }

          // 학생 + 모든 학부모 앱 알림 + 푸시 (fire-and-forget). 헬퍼가 표준 title 생성.
          notifyPointsGranted({
            studentId: student.id,
            type: pointType,
            amount: pointAmount,
            reason,
            studentName: nameMap.get(student.id),
          }).catch((e) => console.error('[weekly-points] notifyPointsGranted', e));
        }

        // weekly_point_history에 기록 (모든 경우)
        const { error: historyError } = await supabase.from('weekly_point_history').insert({
          student_id: student.id,
          week_start: weekStartStr,
          total_study_minutes: totalStudyMinutes,
          goal_minutes: goalMinutes,
          is_achieved: isGoalAchieved,
          point_id: pointId,
        });

        if (historyError) {
          results.errors.push(`History for ${student.id}: ${historyError.message}`);
          continue;
        }

        results.processed++;
        if (isGoalAchieved) {
          results.rewarded++;
        } else if (applyPenalty) {
          results.penalized++;
        } else {
          results.neutral++;
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        results.errors.push(`Student ${student.id}: ${errorMessage}`);
      }
    }

    // 고아 행 탐지 — points 는 부여됐는데 weekly_point_history 가 없는 경우.
    // 부여(points) → 이력(weekly_point_history) 순서라, 이력 INSERT 가 실패하면
    // 상벌점만 남고 멱등 게이트(processedSet)에는 안 잡혀 다음 실행에서 중복 부여될 수 있다.
    // 순서를 뒤집으면 반대로 "이력만 있고 부여 안 됨" 이 조용히 발생하므로,
    // 순서는 유지하고 대신 발생 여부를 매 실행마다 보고한다. (실측 발생 0건)
    let orphanAutoWeekly: number | null = null;
    try {
      const [{ data: weeklyPointRows }, { data: historyRows }] = await Promise.all([
        supabase.from('points').select('id').eq('event_kind', 'auto_weekly'),
        supabase.from('weekly_point_history').select('point_id').not('point_id', 'is', null),
      ]);
      const referenced = new Set((historyRows ?? []).map((h) => h.point_id as string));
      orphanAutoWeekly = (weeklyPointRows ?? []).filter((p) => !referenced.has(p.id)).length;
      if (orphanAutoWeekly > 0) {
        console.error(
          `[weekly-points] 고아 auto_weekly 행 ${orphanAutoWeekly}건 — 이력 없이 부여된 상벌점이 있습니다`,
        );
      }
    } catch (e) {
      console.error('[weekly-points] orphan check failed', e);
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.processed} students`,
      weekStart: weekStartStr,
      orphanAutoWeekly,
      results,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Weekly points cron error:', errorMessage);

    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
