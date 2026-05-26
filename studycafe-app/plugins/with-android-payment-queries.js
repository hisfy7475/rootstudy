/**
 * AndroidManifest <queries> 머지 — NICEPay 결제 시 외부 결제/카드사/백신 앱 가시성 확보.
 *
 * Android 11+ 패키지 가시성 정책상 매니페스트에 선언되지 않은 외부 앱은
 * canOpenURL / queryIntentActivities / resolveActivity 가 모두 가려진 결과를 반환합니다.
 *
 * 패키지 목록은 NICEPay 공식 가이드(developers.nicepay.co.kr/manual-app.php)의
 * Android 패키지명 목록을 그대로 반영.
 */
const { withAndroidManifest } = require('expo/config-plugins');

const PAYMENT_PACKAGES = [
  // === 신용카드 앱카드/앱 ===
  'kr.co.samsungcard.mpocket', // 삼성카드 mPocket
  'com.shcard.smartpay', // 신한 페이판
  'com.shinhancard.smartshinhan', // 신한카드
  'com.shinhan.smartcaremgr', // 신한 SmartCareMgr
  'com.kbcard.cxh.appcard', // KB국민카드 앱카드
  'com.kbstar.liivbank', // KB 리브
  'com.kbstar.reboot', // KB 스타뱅킹
  'com.hyundaicard.appcard', // 현대카드
  'net.ib.android.smcard', // 현대카드 SmartM
  'com.hanaskcard.paycla', // 하나SK카드
  'kr.co.hanamembers.hmscustomer', // 하나멤버스
  'nh.smart.nhallonepay', // NH올원페이
  'com.wooricard.smartapp', // 우리카드
  'com.wooribank.smart.npib', // 우리은행
  'kr.co.citibank.citimobile', // 시티
  'com.lcacApp', // 롯데카드
  'com.kakaobank.channel', // 카카오뱅크
  // === 간편결제·송금 ===
  'com.samsung.android.spay', // 삼성페이
  'com.samsung.android.spaylite', // 삼성페이 라이트
  'com.kakao.talk', // 카카오톡(카카오페이 호출 경로)
  'com.nhn.android.search', // 네이버 (네이버페이)
  'com.nhnent.payapp', // 페이코
  'com.ssg.serviceapp.android.egiftcertificate', // SSG페이
  'com.lge.lgpay', // LG페이
  'com.lottemembers.android', // L페이/롯데멤버스
  'com.tencent.mm', // 위챗페이
  'viva.republica.toss', // 토스
  // === ISP/공인인증 ===
  'kvp.jjy.MispAndroid320', // ISP/페이북
  'com.hanaskcard.rocomo.potal', // 하나 인증
  'com.lumensoft.touchenappfree', // TouchEn
  // === 백신 ===
  'com.TouchEn.mVaccine.webs',
  'com.ahnlab.v3mobileplus',
  'kr.co.shiftworks.vguardweb',
  // === 계좌이체 ===
  'com.kftc.bankpay.android', // 금결원
  'com.kbankwith.smartbank', // 케이뱅크
  // === 통신사 본인인증 ===
  'com.sktelecom.tauth',
  'com.kt.ktauth',
  'com.lguplus.smartotp',
];

const PAYMENT_SCHEMES = [
  // 결제·간편결제 스킴
  'kakaotalk',
  'kakaopay',
  'supertoss',
  'payco',
  'samsungpay',
  'ispmobile',
  'kftc-bankpay',
  'lpayapp',
  'cloudpay',
  // 카드사 앱카드 스킴
  'shinhan-sr-ansimclick',
  'kb-acp',
  'hdcardappcardansimclick',
  'lotteappcard',
  'hanawalletmembers',
  'nhappcardansimclick',
  'citimobileapp',
  // 마켓
  'market',
  'onestore',
  // 백신·보안
  'mvaccine',
  'vguard',
  'v3mobile',
  'droidxantivirus',
  'smartwall',
  'nidlogin',
];

function ensureArray(target, key) {
  if (!target[key]) target[key] = [];
  if (!Array.isArray(target[key])) target[key] = [target[key]];
  return target[key];
}

function hasPackage(packages, name) {
  return packages.some((p) => p?.$?.['android:name'] === name);
}

function hasSchemeIntent(intents, scheme) {
  return intents.some((intent) => {
    const data = intent?.data;
    if (!data) return false;
    const dataArr = Array.isArray(data) ? data : [data];
    return dataArr.some((d) => d?.$?.['android:scheme'] === scheme);
  });
}

function mergeQueries(manifest) {
  const root = manifest.manifest;
  const queriesList = ensureArray(root, 'queries');
  if (queriesList.length === 0) queriesList.push({});
  const queries = queriesList[0];

  const packages = ensureArray(queries, 'package');
  for (const pkg of PAYMENT_PACKAGES) {
    if (!hasPackage(packages, pkg)) {
      packages.push({ $: { 'android:name': pkg } });
    }
  }

  const intents = ensureArray(queries, 'intent');
  for (const scheme of PAYMENT_SCHEMES) {
    if (!hasSchemeIntent(intents, scheme)) {
      intents.push({
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
        data: [{ $: { 'android:scheme': scheme } }],
      });
    }
  }

  return manifest;
}

const withAndroidPaymentQueries = (config) => {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = mergeQueries(cfg.modResults);
    return cfg;
  });
};

module.exports = withAndroidPaymentQueries;
module.exports.mergeQueries = mergeQueries;
module.exports.PAYMENT_PACKAGES = PAYMENT_PACKAGES;
module.exports.PAYMENT_SCHEMES = PAYMENT_SCHEMES;
