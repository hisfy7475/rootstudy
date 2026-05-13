/**
 * NICEPay PG Web v3 한글 인코딩 헬퍼 (P0-2).
 *
 * 배경:
 *   NICEPay 결제창에 한글 GoodsName 을 UTF-8 로 보내면 일부 케이스에서 깨진 채
 *   payment_logs.raw_response.GoodsName 에 echo 됨 (U+FFFD `&#65533;`).
 *   같은 응답의 ResultMsg/CardName 은 한글 정상 → 요청 인코딩 손상이 원인.
 *
 *   NICEPay 가맹점 charset 설정이 EUC-KR 기준이므로, 한글 필드를 EUC-KR 로 인코딩해 전송.
 *
 * Node 내장으로는 EUC-KR 인코딩 불가 (Buffer/TextEncoder 미지원).
 * iconv-lite 의존성 사용.
 */

import iconv from 'iconv-lite';

/**
 * 한글 텍스트를 EUC-KR 바이트로 인코딩 후, 지정 바이트 수 이하로 잘라낸 안전한 문자열을 반환.
 * 마지막 멀티바이트 글자가 잘려 깨진 바이트가 남는 케이스를 방지한다.
 *
 * @example
 *   truncateBytesForEucKr('5월 석식 · 일일', 40)
 *     → '5월 석식 · 일일' (그대로, 14 바이트)
 *   truncateBytesForEucKr('매우 긴 한글 상품명...', 40)
 *     → 첫 40 바이트 내에 들어가는 글자까지만
 */
export function truncateBytesForEucKr(text: string, maxBytes: number): string {
  if (!text) return '';

  // EUC-KR 호환성 위해 일부 특수문자를 ASCII 로 치환
  // (`·` U+00B7 는 EUC-KR 도 표현 가능하지만 NICEPay 일부 케이스에서 깨졌던 글자)
  const sanitized = text.replace(/·/g, '-');

  const encoded = iconv.encode(sanitized, 'euc-kr');
  if (encoded.length <= maxBytes) return sanitized;

  // 바이트 자르기 후 디코딩 → 마지막 깨진 바이트가 있으면 한 글자씩 더 줄임
  let limit = maxBytes;
  while (limit > 0) {
    const sliced = encoded.subarray(0, limit);
    const decoded = iconv.decode(sliced, 'euc-kr');
    // replacement char 가 끝에 있으면 잘림 발생 → 한 바이트 줄여 재시도
    if (decoded.endsWith('\uFFFD')) {
      limit -= 1;
      continue;
    }
    return decoded;
  }
  return '';
}

/**
 * EUC-KR 인코딩된 form-urlencoded body 문자열을 만든다.
 *
 * 결과는 모두 ASCII (percent-encoded) 라 string 으로 충분하며, fetch 가 그대로
 * ASCII 바이트로 전송한다. wire format 은 Uint8Array 와 동일.
 * 한글 value 의 바이트만 EUC-KR 로 인코딩한 후 percent-encoding 한다.
 */
export function encodeFormUrlEucKr(params: Record<string, string>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    const encodedKey = encodeURIComponent(k);
    // 한글 value 는 EUC-KR 바이트 단위로 percent-encode
    const bytes = iconv.encode(v ?? '', 'euc-kr');
    let encodedVal = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      // RFC 3986 unreserved: A-Z a-z 0-9 - _ . ~
      if (
        (b >= 0x41 && b <= 0x5a) ||
        (b >= 0x61 && b <= 0x7a) ||
        (b >= 0x30 && b <= 0x39) ||
        b === 0x2d ||
        b === 0x5f ||
        b === 0x2e ||
        b === 0x7e
      ) {
        encodedVal += String.fromCharCode(b);
      } else {
        encodedVal += '%' + b.toString(16).toUpperCase().padStart(2, '0');
      }
    }
    parts.push(`${encodedKey}=${encodedVal}`);
  }
  return parts.join('&');
}
