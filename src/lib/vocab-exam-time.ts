// 영단어 시험 문항 수 · 제한시간 계산.
//
// 'use server' 모듈(src/lib/actions/vocab.ts)은 async 함수만 export 할 수 있어
// 동기 헬퍼를 여기에 둔다. 서버 액션과 daily-reset 크론이 같은 기준을 쓰도록 하는 SSOT.

/** 평일 시험 문항 수. */
export const EXAM_TOTAL = 40;

/** 평일(40문항) 기준 제한시간(초). */
export const TIME_LIMIT_SEC = 10 * 60;

/** 40문항=10분 기준 문항당 배정 시간(15초). */
export const SEC_PER_QUESTION = TIME_LIMIT_SEC / EXAM_TOTAL;

/**
 * 시험 제한시간(초). 평일 40문항은 10분 그대로, 금요일 누적 오답(문항 수 가변)은 문항당 15초로 환산.
 *
 * - 금요일은 그 주 오답을 상한 없이 전부 출제한다(클라이언트 요청, 커밋 819556b). 실제로 90문항 이상이
 *   나오는데 10분 고정이면 물리적으로 완주가 불가능하다 — 71문항을 68문항까지 풀고 10분에 강제마감돼
 *   그 주 개근을 잃은 사례가 있었다.
 * - 하한 10분: 오답이 1개뿐인 금요일 시험이 15초짜리가 되는 것을 막는다.
 */
export function examTimeLimitSec(total: number): number {
  return Math.max(TIME_LIMIT_SEC, Math.ceil(total * SEC_PER_QUESTION));
}
