/**
 * 출석 이벤트(check_in/check_out/break_start/break_end)에서
 * 실제 학습 세션 구간을 추출하고 학습일(KST 06:00 ~ 다음날 03:00) 기준으로
 * 학습 시간을 계산하는 공유 유틸.
 *
 * 학습일 도메인 규칙은 CLAUDE.md 및 src/lib/utils.ts 참고.
 */

import { classifyGate } from '@/lib/caps/gate';

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
 * - 마지막에 닫히지 않은 세션은 periodEnd(또는 그 이전의 현재 시각)로 마감
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
    const now = new Date();
    const endTime = now < periodEnd ? now : periodEnd;
    sessions.push({
      startTime: checkInTime,
      endTime,
      durationSeconds: Math.floor((endTime.getTime() - checkInTime.getTime()) / 1000),
    });
  }

  return sessions;
}
