export type RefundPolicyLine = {
  text: string;
  emphasized?: boolean;
};

export type RefundPolicy = {
  lines: RefundPolicyLine[];
  contact: string;
};

const CUSTOMER_CENTER = '02-6447-0006';

type Case = 'meal_one_time' | 'meal_recurring' | 'exam';

function caseOf(input: {
  category: 'meal' | 'exam';
  variantKind?: 'one_time' | 'recurring';
}): Case {
  if (input.category === 'exam') return 'exam';
  return input.variantKind === 'recurring' ? 'meal_recurring' : 'meal_one_time';
}

/**
 * 클라이언트 제공 정책 원본 8줄(장바구니 줄 제외)을 모든 케이스에 동일하게 표시.
 * 케이스별로 강조(빨간 글자) 줄만 달리한다 — 레퍼런스 앱과 동일한 패턴.
 */
export function getRefundPolicy(input: {
  category: 'meal' | 'exam';
  variantKind?: 'one_time' | 'recurring';
}): RefundPolicy {
  const c = caseOf(input);
  return {
    lines: [
      { text: '모든 신청은 당일 취소가 절대 불가합니다.' },
      {
        text: '일일 메뉴(석식)는 이용일 2일 전까지 취소가 가능합니다.',
        emphasized: c === 'meal_one_time',
      },
      {
        text: '정기 메뉴(중식)는 이용 직전 주 금요일까지만 취소가 가능합니다.',
        emphasized: c === 'meal_recurring',
      },
      {
        text: '정기 메뉴의 경우, 5일 모두 메뉴가 신청되니 유의하여 주세요.',
        emphasized: c === 'meal_recurring',
      },
      {
        text: '모의고사 신청 시 취소가 절대 불가하니 신중하게 신청해 주세요.',
        emphasized: c === 'exam',
      },
      { text: '취소 기간이 지났을 경우, 개인적인 사유로의 환불 및 취소가 불가합니다.' },
      { text: `그 외 기타 문의는 고객센터(${CUSTOMER_CENTER})로 문의 바랍니다.` },
    ],
    contact: CUSTOMER_CENTER,
  };
}
