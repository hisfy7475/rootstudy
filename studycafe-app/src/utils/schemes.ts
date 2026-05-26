/**
 * PG·카드사·간편결제·백신 모듈 등 WebView 외부 위임 대상 URL 판별.
 *
 * NICEPay 공식 가이드(developers.nicepay.co.kr/manual-app.php) 의 shouldOverrideUrlLoading
 * 체크 패턴을 그대로 반영. 실제 디스패치는 ./intentDispatcher.ts 의 dispatchExternal 에 위임.
 */

// startsWith 로 검사하는 prefix (스킴 형태)
export const PG_APP_URL_PREFIXES = [
  // 결제·간편결제
  'ispmobile://',
  'kftc-bankpay://',
  'kakaotalk://',
  'kakaopay://',
  'supertoss://',
  'lpayapp://',
  'samsungpay://',
  'shinhan-sr-ansimclick://',
  'kb-acp://',
  'hdcardappcardansimclick://',
  'lotteappcard://',
  'hanawalletmembers://',
  'nhappcardansimclick://',
  'citimobileapp://',
  'payco://',
  'cloudpay://',
  // 안드로이드 Intent / 마켓
  // 'intent:' 단독 prefix — intent:HOST 와 intent://HOST 변형 모두 매치.
  'intent:',
  'market://',
  'onestore://',
  // 보안 모듈 prefix
  'smartwall://',
  'nidlogin://',
  // iOS 스토어
  'itms-appss://',
  'itms-apps://',
] as const;

// contains 로 검사 — NICEPay 가이드가 startsWith 가 아닌 contains 로 명시한 패턴.
// 백신/안티바이러스 모듈은 종종 prefix 형태가 다양해 contains 가 더 안전.
const CONTAINS_PATTERNS = [
  'vguard',
  'droidxantivirus',
  'v3mobile',
  'mvaccine',
  '.apk',
  // 안랩 V3 다운로드 페이지(http) — NICEPay 가이드 명시.
  'm.ahnlab.com/kr/site/download',
];

const HTTP_PREFIXES = ['http://', 'https://', 'about:', 'data:'];

export function shouldOpenExternalAppForUrl(url: string): boolean {
  const lower = url.toLowerCase();

  if (PG_APP_URL_PREFIXES.some((p) => lower.startsWith(p.toLowerCase()))) {
    return true;
  }
  if (CONTAINS_PATTERNS.some((p) => lower.includes(p))) {
    return true;
  }
  if (HTTP_PREFIXES.some((p) => lower.startsWith(p))) {
    return false;
  }
  // 알려지지 않은 커스텀 스킴도 외부 위임 (보수적 안전망).
  return lower.includes('://');
}
