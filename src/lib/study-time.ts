/**
 * 출석 이벤트(check_in/check_out/break_start/break_end)에서
 * 실제 학습 세션 구간을 추출하고 학습일(KST 06:00 ~ 다음날 03:00) 기준으로
 * 학습 시간을 계산하는 공유 유틸.
 *
 * 학습일 도메인 규칙은 CLAUDE.md 및 src/lib/utils.ts 참고.
 */

export type AttendanceRecord = { type: string; timestamp: string };

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
