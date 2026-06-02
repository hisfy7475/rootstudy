/**
 * 미분류 시간 계산 공통 헬퍼.
 *
 * 학생 통계 페이지(UI), 일일 자동 상점 cron(gate), 메인 위젯(실시간)이
 * 동일한 알고리즘과 동일한 자투리 필터를 공유하도록 한 곳에 모은다.
 *
 * 핵심 원칙
 * - `unclassifiedSeconds` 는 빼기(`study - classified`)가 아니라
 *   **자투리 필터 후 남은 segments 의 합**으로 산출 — 표시값과 gate 값이 항상 일치.
 * - `opts.minSegmentSeconds` 미만 자투리(과목 전환 phantom gap 포함)는
 *   미분류 카운트에서 제외.
 */

import { isStudyExcluded } from '@/lib/study-time';

export interface UnclassifiedSegment {
  id: string;
  startTime: string;
  endTime: string;
  durationSeconds: number;
}

export interface UnclassifiedMetrics {
  studySeconds: number;
  studyMinutes: number;
  unclassifiedSeconds: number;
  unclassifiedMinutes: number;
  segments: UnclassifiedSegment[];
}

interface AttendanceLike {
  type: string;
  timestamp: string;
  source?: string | null;
  gate_name?: string | null;
}

interface SubjectLike {
  started_at: string;
  ended_at: string | null;
}

interface Options {
  /** 이 값 미만 길이의 미분류 자투리는 제외 (초). */
  minSegmentSeconds: number;
  /** true 면 현재 진행 중인 세션을 `now` 로 클램프 (실시간 위젯 용도). */
  clampToNow?: boolean;
}

/**
 * 입실 세션(check_in/break_end ↔ check_out/break_start 페어) 추출.
 * 종료가 없는 마지막 세션은 `effectiveEnd` 로 클램프.
 */
function extractInSessions(
  attendance: AttendanceLike[],
  effectiveEnd: number,
): Array<[number, number]> {
  const sessions: Array<[number, number]> = [];
  let inStart: number | null = null;

  // 직원/경비 게이트(소프트 제외) 기록 배제. source/gate_name 미선택 호출부엔 무영향.
  for (const a of attendance.filter((r) => !isStudyExcluded(r))) {
    const t = new Date(a.timestamp).getTime();
    if (a.type === 'check_in' || a.type === 'break_end') {
      if (inStart === null) inStart = t;
    } else if (a.type === 'check_out' || a.type === 'break_start') {
      if (inStart !== null) {
        sessions.push([inStart, t]);
        inStart = null;
      }
    }
  }
  if (inStart !== null) sessions.push([inStart, effectiveEnd]);

  return sessions;
}

export function calculateUnclassifiedMetrics(
  attendance: AttendanceLike[],
  subjects: SubjectLike[],
  dayEnd: Date,
  opts: Options,
): UnclassifiedMetrics {
  const now = Date.now();
  const effectiveEnd = opts.clampToNow && now < dayEnd.getTime() ? now : dayEnd.getTime();

  const inSessions = extractInSessions(attendance, effectiveEnd);

  const subSessions: Array<[number, number]> = subjects.map((s) => [
    new Date(s.started_at).getTime(),
    s.ended_at ? new Date(s.ended_at).getTime() : effectiveEnd,
  ]);

  // segments 추출 (자투리 필터 전)
  const minMs = opts.minSegmentSeconds * 1000;
  const segments: UnclassifiedSegment[] = [];

  for (const [iStart, iEnd] of inSessions) {
    // 이 세션과 겹치는 subject 구간들의 [start, end] 수집
    const covered: Array<{ start: number; end: number }> = [];
    for (const [sStart, sEnd] of subSessions) {
      const overlapStart = Math.max(iStart, sStart);
      const overlapEnd = Math.min(iEnd, sEnd);
      if (overlapEnd > overlapStart) {
        covered.push({ start: overlapStart, end: overlapEnd });
      }
    }

    // covered 병합
    covered.sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];
    for (const c of covered) {
      if (merged.length === 0 || merged[merged.length - 1].end < c.start) {
        merged.push({ ...c });
      } else {
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, c.end);
      }
    }

    // 세션 내 uncovered 구간을 segment 로 추출, 자투리 필터 적용
    let currentStart = iStart;
    const pushSegment = (start: number, end: number) => {
      const durationMs = end - start;
      if (durationMs < minMs) return; // 자투리 제외
      segments.push({
        id: `${start}`,
        startTime: new Date(start).toISOString(),
        endTime: new Date(end).toISOString(),
        durationSeconds: Math.floor(durationMs / 1000),
      });
    };
    for (const m of merged) {
      if (m.start > currentStart) pushSegment(currentStart, m.start);
      currentStart = Math.max(currentStart, m.end);
    }
    if (currentStart < iEnd) pushSegment(currentStart, iEnd);
  }

  const studyMs = inSessions.reduce((sum, [a, b]) => sum + (b - a), 0);
  const unclassifiedSecondsRaw = segments.reduce((sum, s) => sum + s.durationSeconds, 0);

  return {
    studySeconds: Math.floor(studyMs / 1000),
    studyMinutes: Math.floor(studyMs / 60000),
    unclassifiedSeconds: unclassifiedSecondsRaw,
    unclassifiedMinutes: Math.floor(unclassifiedSecondsRaw / 60),
    segments,
  };
}
