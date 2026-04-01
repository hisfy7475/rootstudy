/**
 * PG·카드사 앱 연동 URL prefix (WebView에서 외부 앱으로 위임).
 * @see ROADMAP / ref WebClient.java shouldOverrideUrlLoading
 */
export const PG_APP_URL_PREFIXES = [
  'ispmobile://',
  'kftc-bankpay://',
  'kakaotalk://',
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
  'intent://',
] as const;

export function shouldOpenExternalAppForUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return PG_APP_URL_PREFIXES.some((p) => lower.startsWith(p.toLowerCase()));
}
