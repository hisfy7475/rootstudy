/**
 * 단어 뜻 표시 보정.
 *
 * 원본 엑셀에서 한 단어의 여러 뜻이 세미콜론(`;`)으로 구분돼 들어온 경우가 있는데,
 * 화면에서는 쉼표(`, `)로 통일해 보여준다. (예: "(비용이) 들다; 비용, 대가" → "(비용이) 들다, 비용, 대가")
 *
 * ⚠️ 주의: 영단어 시험 채점은 "저장된 보기/정답 문자열의 정확한 일치"로 동작한다
 * (saveVocabAnswer 의 options.includes(selected) 등). 따라서 이 함수는 반드시
 * **화면에 그리는 텍스트에만** 적용하고, 선택값 전송·정답 비교·state 키 등 로직에는 절대 쓰지 않는다.
 */
export function formatMeaning(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/\s*;\s*/g, ', ') // 세미콜론 구분 → 쉼표
    .replace(/(?:,\s*)+$/, '') // 끝에 남은 잉여 구분자 제거
    .trim();
}
