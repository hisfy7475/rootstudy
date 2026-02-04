import crypto from 'crypto';

// ============================================
// 환경변수 및 타입 정의
// ============================================

const NCLOUD_ACCESS_KEY = process.env.NCLOUD_ACCESS_KEY || '';
const NCLOUD_SECRET_KEY = process.env.NCLOUD_SECRET_KEY || '';
const NCLOUD_SENS_SERVICE_ID = process.env.NCLOUD_SENS_SERVICE_ID || '';
const NCLOUD_KAKAO_PLUS_FRIEND_ID = process.env.NCLOUD_KAKAO_PLUS_FRIEND_ID || '';
const NCLOUD_KAKAO_TEMPLATE_CODE = process.env.NCLOUD_KAKAO_TEMPLATE_CODE || '';

const SENS_API_URL = 'https://sens.apigw.ntruss.com';

// 알림톡 메시지 타입
interface AlimtalkMessage {
  countryCode?: string;
  to: string;
  content: string;
  buttons?: AlimtalkButton[];
}

interface AlimtalkButton {
  type: 'DS' | 'WL' | 'AL' | 'BK' | 'MD' | 'AC';
  name: string;
  linkMobile?: string;
  linkPc?: string;
  schemeIos?: string;
  schemeAndroid?: string;
}

// 알림톡 요청 타입
interface AlimtalkRequest {
  plusFriendId: string;
  templateCode: string;
  messages: AlimtalkMessage[];
  reserveTime?: string;
  reserveTimeZone?: string;
}

// 알림톡 응답 타입
export interface AlimtalkResponse {
  requestId?: string;
  requestTime?: string;
  statusCode: string;
  statusName: string;
  messages?: AlimtalkMessageResponse[];
  error?: string;
}

interface AlimtalkMessageResponse {
  messageId: string;
  countryCode?: string;
  to: string;
  content: string;
  requestStatusCode: string;
  requestStatusName: string;
  requestStatusDesc: string;
  useSmsFailover: boolean;
}

// ============================================
// HMAC-SHA256 서명 생성 (네이버 클라우드 API 인증)
// ============================================

function makeSignature(
  method: string,
  url: string,
  timestamp: string
): string {
  const space = ' ';
  const newLine = '\n';

  const message = [
    method,
    space,
    url,
    newLine,
    timestamp,
    newLine,
    NCLOUD_ACCESS_KEY,
  ].join('');

  const hmac = crypto.createHmac('sha256', NCLOUD_SECRET_KEY);
  hmac.update(message);
  return hmac.digest('base64');
}

// ============================================
// 전화번호 포맷팅
// ============================================

function formatPhoneNumber(phone: string): string {
  // 숫자만 추출
  const digits = phone.replace(/[^0-9]/g, '');
  
  // 010-xxxx-xxxx 형식에서 앞의 0을 제거하지 않음
  // 네이버 클라우드는 010으로 시작하는 번호를 그대로 사용
  return digits;
}

// ============================================
// 환경변수 검증
// ============================================

export function isAlimtalkConfigured(): boolean {
  return !!(
    NCLOUD_ACCESS_KEY &&
    NCLOUD_SECRET_KEY &&
    NCLOUD_SENS_SERVICE_ID &&
    NCLOUD_KAKAO_PLUS_FRIEND_ID &&
    NCLOUD_KAKAO_TEMPLATE_CODE
  );
}

export function getAlimtalkConfig() {
  return {
    isConfigured: isAlimtalkConfigured(),
    hasAccessKey: !!NCLOUD_ACCESS_KEY,
    hasSecretKey: !!NCLOUD_SECRET_KEY,
    hasServiceId: !!NCLOUD_SENS_SERVICE_ID,
    hasPlusFriendId: !!NCLOUD_KAKAO_PLUS_FRIEND_ID,
    hasTemplateCode: !!NCLOUD_KAKAO_TEMPLATE_CODE,
  };
}

// ============================================
// 알림톡 발송 함수
// ============================================

/**
 * 단일 알림톡 발송
 */
export async function sendAlimtalk(params: {
  to: string;
  content: string;
  buttons?: AlimtalkButton[];
}): Promise<AlimtalkResponse> {
  return sendBulkAlimtalk({
    messages: [
      {
        to: params.to,
        content: params.content,
        buttons: params.buttons,
      },
    ],
  });
}

/**
 * 대량 알림톡 발송 (최대 100건)
 */
export async function sendBulkAlimtalk(params: {
  messages: {
    to: string;
    content: string;
    buttons?: AlimtalkButton[];
  }[];
  templateCode?: string;
}): Promise<AlimtalkResponse> {
  // 환경변수 검증
  if (!isAlimtalkConfigured()) {
    console.error('Alimtalk configuration is incomplete');
    return {
      statusCode: '500',
      statusName: 'fail',
      error: '알림톡 설정이 완료되지 않았습니다. 환경변수를 확인해주세요.',
    };
  }

  // 메시지가 없으면 에러
  if (!params.messages || params.messages.length === 0) {
    return {
      statusCode: '400',
      statusName: 'fail',
      error: '발송할 메시지가 없습니다.',
    };
  }

  // 최대 100건 제한
  if (params.messages.length > 100) {
    return {
      statusCode: '400',
      statusName: 'fail',
      error: '한 번에 최대 100건까지만 발송할 수 있습니다.',
    };
  }

  const timestamp = Date.now().toString();
  const url = `/alimtalk/v2/services/${NCLOUD_SENS_SERVICE_ID}/messages`;
  const signature = makeSignature('POST', url, timestamp);

  const requestBody: AlimtalkRequest = {
    plusFriendId: NCLOUD_KAKAO_PLUS_FRIEND_ID,
    templateCode: params.templateCode || NCLOUD_KAKAO_TEMPLATE_CODE,
    messages: params.messages.map((msg) => ({
      countryCode: '82',
      to: formatPhoneNumber(msg.to),
      content: msg.content,
      buttons: msg.buttons,
    })),
  };

  try {
    const response = await fetch(`${SENS_API_URL}${url}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-ncp-apigw-timestamp': timestamp,
        'x-ncp-iam-access-key': NCLOUD_ACCESS_KEY,
        'x-ncp-apigw-signature-v2': signature,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Alimtalk API error:', data);
      return {
        statusCode: response.status.toString(),
        statusName: 'fail',
        error: data.error?.message || data.message || '알림톡 발송에 실패했습니다.',
      };
    }

    return data as AlimtalkResponse;
  } catch (error) {
    console.error('Alimtalk request failed:', error);
    return {
      statusCode: '500',
      statusName: 'fail',
      error: error instanceof Error ? error.message : '알림톡 발송 중 오류가 발생했습니다.',
    };
  }
}

// ============================================
// 발송 결과 분석 헬퍼
// ============================================

export function analyzeAlimtalkResult(response: AlimtalkResponse): {
  success: boolean;
  totalCount: number;
  successCount: number;
  failedCount: number;
  failedNumbers: string[];
} {
  if (!response.messages) {
    return {
      success: false,
      totalCount: 0,
      successCount: 0,
      failedCount: 0,
      failedNumbers: [],
    };
  }

  const successMessages = response.messages.filter(
    (msg) => msg.requestStatusCode === 'A000'
  );
  const failedMessages = response.messages.filter(
    (msg) => msg.requestStatusCode !== 'A000'
  );

  return {
    success: response.statusCode === '202' && failedMessages.length === 0,
    totalCount: response.messages.length,
    successCount: successMessages.length,
    failedCount: failedMessages.length,
    failedNumbers: failedMessages.map((msg) => msg.to),
  };
}
