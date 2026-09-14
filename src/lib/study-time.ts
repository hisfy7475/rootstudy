/**
 * 출석 이벤트(check_in/check_out/break_start/break_end)에서
 * 실제 학습 세션 구간을 추출하고 학습일(KST 06:00 ~ 다음날 03:00) 기준으로
 * 학습 시간을 계산하는 공유 유틸.
 *
 * 학습일 도메인 규칙은 CLAUDE.md 및 src/lib/utils.ts 참고.
 */

import { classifyGate } from '@/lib/caps/gate';
import { getStudyDate, getStudyDayBounds } from '@/lib/utils';

export type AttendanceRecord = {
  type: string;
  timestamp: string;
  source?: string | null;
  gate_name?: string | null;
};

/**
 * 순공/상태 계산에서 제외해야 하는 출입 기록인지 판정한다.
 *
 * source='caps' 이면서 게이트명이 학생용(입실/퇴실)이 아닌 직원·경비·등록용 단말기
 * (classifyGate === null)이면 제외 대상이다. manual/auto_reset 행, 게이트명이 비어 있는
 * (아직 백필 안 된) 과거 행, 학생용 게이트 행은 모두 포함(보수적)한다.
 *
 * 사용처: 출입 기록 배열을 순공 합산 / 미분류 계산 / 마지막-레코드 상태판정에 넘기기 전에
 * `attendance.filter((r) => !isStudyExcluded(r))` 로 거른다. 각 fetch 에서 `source, gate_name`
 * 컬럼을 함께 SELECT 해야 한다.
 */
export function isStudyExcluded(r: {
  type?: string;
  timestamp?: string;
  source?: string | null;
  gate_name?: string | null;
}): boolean {
  return r.source === 'caps' && !!r.gate_name && classifyGate(r.gate_name) === null;
}

export interface StudySessionChunk {
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
}

/**
 * 출석 이벤트 배열에서 실제 학습 세션 구간을 추출한다.
 * - check_in / break_end → 세션 시작
 * - check_out / break_start → 세션 종료
 * - 마지막에 닫히지 않은 세션은 현재 시각 / periodEnd / 그 세션이 속한 학습일 종료(03:00)
 *   중 가장 이른 시점으로 마감
 *
 * 입력은 timestamp 오름차순 정렬 가정.
 */
export function extractStudySessions(
  attendance: AttendanceRecord[],
  periodEnd: Date,
): StudySessionChunk[] {
  const sessions: StudySessionChunk[] = [];
  let checkInTime: Date | null = null;

  // 직원/경비 게이트(소프트 제외) 기록은 세션 계산에서 배제.
  // source/gate_name 을 함께 SELECT 한 호출부에서만 실제로 걸러지며, 그 외엔 무영향.
  for (const record of attendance.filter((r) => !isStudyExcluded(r))) {
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
            durationSeconds: Math.floor((timestamp.getTime() - checkInTime.getTime()) / 1000),
          });
          checkInTime = null;
        }
        break;
      case 'break_start':
        if (checkInTime) {
          sessions.push({
            startTime: checkInTime,
            endTime: timestamp,
            durationSeconds: Math.floor((timestamp.getTime() - checkInTime.getTime()) / 1000),
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
    // 미닫힘(퇴실 미기록) 세션의 마감 시각. 학습일 종료(03:00) 상한이 핵심이다 —
    // 이게 없으면 강제 퇴실(daily-reset)이 한 번 빠진 세션 하나가 주간 집계에서
    // periodEnd(학습주 종료 = 다음 월 06:00)까지 그대로 이어져 순공이 폭주한다.
    // 실제 사고: 2026-09-13 01:02 입실 후 퇴실 없음 → 출석부 32h25m / 리포트 5h25m 불일치.
    // 도메인상 살아있는 세션은 03:00 를 넘길 수 없으므로(03:00~06:00 리셋 데드존)
    // 이 상한은 정상 세션에는 영향이 없고, 집계 화면 간 값도 자동으로 일치하게 만든다.
    const now = new Date();
    const studyDayEnd = getStudyDayBounds(getStudyDate(checkInTime)).end;
    const endTime = new Date(Math.min(now.getTime(), periodEnd.getTime(), studyDayEnd.getTime()));
    if (endTime.getTime() > checkInTime.getTime()) {
      sessions.push({
        startTime: checkInTime,
        endTime,
        durationSeconds: Math.floor((endTime.getTime() - checkInTime.getTime()) / 1000),
      });
    }
  }

  return sessions;
}

/**
 * 출석 이벤트 배열의 순공 합계(초)를 반환한다. extractStudySessions의 얇은 래퍼.
 *
 * periodEnd 는 반드시 집계 구간의 종료 시각을 넘긴다.
 *
 * ⚠️ **단일 학습일 집계에만 쓴다.** 주간/월간처럼 여러 학습일을 한 번에 넘기면
 * 몰입도 리포트(학습일별 계산)와 값이 갈린다 — `sumStudySecondsByStudyDay` 를 쓸 것.
 */
export function sumStudySeconds(attendance: AttendanceRecord[], periodEnd: Date): number {
  return extractStudySessions(attendance, periodEnd).reduce((sum, c) => sum + c.durationSeconds, 0);
}

/**
 * 여러 학습일에 걸친 순공 합계(초). **주간·월간 집계의 정본.**
 *
 * 학습일(06:00~다음날 03:00) 단위로 잘라 각각 `extractStudySessions` 에 넘기고 합산한다.
 * 몰입도 리포트가 쓰는 계산 방식과 완전히 동일하므로 두 화면의 숫자가 구조적으로 일치한다.
 *
 * 주 전체를 `sumStudySeconds` 에 한 번에 넘기면 안 되는 이유(2026-09 남하윤 건에서 둘 다 실측):
 *  1. 미닫힘 세션이 학습일 경계가 아니라 **집계 구간 끝**까지 이어진다
 *     → 출석부 32h25m vs 리포트 5h25m (27시간 차이).
 *  2. `check_in` 다음에 `check_out` 없이 또 `check_in` 이 오면 앞 세션이 **통째로 사라진다**
 *     → 이번엔 반대로 출석부가 리포트보다 작아진다(퇴실 미기록 다음날 재입실 케이스).
 * 둘 다 강제 퇴실(daily-reset)이 빠졌을 때만 생기지만, 빠져도 화면 간 값이 갈리지 않도록
 * 집계 쪽에서 막는다.
 *
 * @param studyDates 집계할 학습일 목록(YYYY-MM-DD, KST). 보통 getWeekDateStringsFromMondayKST 결과.
 */
export function sumStudySecondsByStudyDay(
  attendance: AttendanceRecord[],
  studyDates: string[],
): number {
  let total = 0;
  for (const dateStr of studyDates) {
    const { start, end } = getStudyDayBounds(dateStr);
    const dayAttendance = attendance.filter((r) => {
      const t = new Date(r.timestamp);
      return t >= start && t <= end;
    });
    if (dayAttendance.length === 0) continue;
    total += sumStudySeconds(dayAttendance, end);
  }
  return total;
}
