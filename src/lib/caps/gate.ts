/**
 * CAPS 게이트 분류 단일 소스.
 *
 * 게이트명에 '입실'/'퇴실'이 포함된 학생용 게이트만 출입 타입으로 분류한다.
 * 그 외(직원·경비·등록용 단말기 등 라벨 없는 게이트)는 null 을 반환해
 * 순공시간 산정에서 스킵/제외한다.
 *
 * 동기화 적재(caps-sync)와 과거 정정(소프트 제외) 양쪽이 동일한 기준을 쓰도록
 * 반드시 이 함수만 사용한다.
 */
export function classifyGate(gateName: string | null | undefined): 'check_in' | 'check_out' | null {
  const name = (gateName ?? '').trim();
  if (name.includes('입실')) return 'check_in';
  if (name.includes('퇴실')) return 'check_out';
  return null;
}
