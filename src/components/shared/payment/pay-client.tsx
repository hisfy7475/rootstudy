'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cancelPendingMealOrder } from '@/lib/actions/meal';
import { NICEPAY_PGWEB_SCRIPT_SRC } from '@/lib/nicepay';
import { isNativeApp } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

/** 네이티브 앱 URL scheme — studycafe-app/src/constants.ts의 URL_SCHEME과 동일해야 함 */
const NATIVE_APP_SCHEME = 'rootstudy://';

/** NICEPay 승인 콜백 경로 (meal/exam 공용). */
const RETURN_PATH = '/api/payments/nicepay/confirm';

/** SSR/hydration 안전하게 네이티브 앱 scheme 반환. 서버: 빈 문자열, 클라이언트(네이티브 WebView): scheme. */
const subscribeNoop = () => () => {};
const getServerSchemeSnapshot = () => '';
const getClientSchemeSnapshot = () => (isNativeApp() ? NATIVE_APP_SCHEME : '');

/**
 * 클라이언트 window.location.origin 기반 절대 returnUrl.
 * NEXT_PUBLIC_SITE_URL 같은 빌드-타임 env 에 의존하지 않고 현재 브라우저 호스트를 그대로 쓴다.
 * — 이렇게 해야 PC(localhost)·모바일 WebView(LAN IP/프로덕션) 어느 쪽에서 접속해도
 *   form action 호스트가 세션 쿠키가 있는 호스트와 일치한다.
 */
const getServerReturnUrlSnapshot = () => '';
const getClientReturnUrlSnapshot = () =>
  typeof window === 'undefined' ? '' : `${window.location.origin}${RETURN_PATH}`;

declare global {
  interface Window {
    goPay?: (form: HTMLFormElement) => void;
    nicepaySubmit?: () => void;
    nicepayClose?: () => void;
  }
}

export type PaymentInit = {
  mid: string;
  ediDate: string;
  signData: string;
  amt: string;
  moid: string;
  goodsNameShort: string;
};

/**
 * NICEPay PG Web v3 결제창 클라이언트 (meal/exam 공용).
 * 학생·학부모, 급식·모의고사 모든 결제 페이지에서 재사용된다.
 */
export function PayClient({
  paymentInit,
  mallReserved,
  backHref,
  orderRowId,
  displayAmount,
  displayGoodsName,
  optionSelections,
}: {
  paymentInit: PaymentInit | null;
  mallReserved: 's' | 'p';
  backHref: string;
  orderRowId: string;
  displayAmount: number;
  displayGoodsName: string;
  /** 모의고사 옵션 스냅샷. 비어있거나 undefined면 옵션 영역 미표시. */
  optionSelections?: { group_name: string; option_name: string }[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  const [paying, setPaying] = useState(false);
  const appScheme = useSyncExternalStore(
    subscribeNoop,
    getClientSchemeSnapshot,
    getServerSchemeSnapshot,
  );
  const returnUrl = useSyncExternalStore(
    subscribeNoop,
    getClientReturnUrlSnapshot,
    getServerReturnUrlSnapshot,
  );

  useEffect(() => {
    // 이전 마운트에서 이미 로드 완료된 경우 — window.goPay 존재로 판단.
    // queueMicrotask로 effect 본문 밖으로 빼서 cascading render lint 회피.
    if (typeof window.goPay === 'function') {
      queueMicrotask(() => setScriptReady(true));
      return;
    }
    // <script> 태그는 있지만 아직 로드 중 — 같은 태그의 load 이벤트에 붙어 대기.
    const existing = document.querySelector<HTMLScriptElement>('script[data-nicepay-pgweb="1"]');
    if (existing) {
      const onLoad = () => setScriptReady(true);
      existing.addEventListener('load', onLoad, { once: true });
      return () => existing.removeEventListener('load', onLoad);
    }
    // 첫 마운트 — 스크립트 주입.
    const s = document.createElement('script');
    s.src = NICEPAY_PGWEB_SCRIPT_SRC;
    s.async = true;
    s.dataset.nicepayPgweb = '1';
    s.onload = () => setScriptReady(true);
    document.body.appendChild(s);
  }, []);

  useEffect(() => {
    if (!scriptReady) return;
    window.nicepaySubmit = () => {
      formRef.current?.submit();
    };
    window.nicepayClose = () => {
      setPaying(false);
      alert('결제가 취소되었습니다.');
    };
    return () => {
      delete window.nicepaySubmit;
      delete window.nicepayClose;
    };
  }, [scriptReady]);

  const startPay = useCallback(() => {
    if (!paymentInit) {
      alert('결제 설정(NEXT_PUBLIC_NICEPAY_MID, NICEPAY_MERCHANT_KEY)을 확인해 주세요.');
      return;
    }
    if (!returnUrl.startsWith('http')) {
      alert('결제 준비가 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    if (!window.goPay) {
      alert('결제 모듈을 불러오는 중입니다. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const form = formRef.current;
    if (!form) return;

    setPaying(true);
    try {
      window.goPay(form);
    } catch (e) {
      console.error(e);
      setPaying(false);
    }
  }, [paymentInit, returnUrl]);

  const handleCancel = async () => {
    await cancelPendingMealOrder(orderRowId);
    router.push(backHref);
  };

  return (
    <div className='space-y-4'>
      {paymentInit ? (
        // form charset 을 EUC-KR 로 강제. NICEPay PG Web v3 가맹점이 EUC-KR 디코딩 기준이라
        // UTF-8 전송 시 한글 GoodsName 이 일부 케이스에서 손상돼 응답에 `&#65533;` 로 echo 되던 문제 해결.
        // 브라우저는 acceptCharset 에 따라 form-encoded body 의 한글 value 를 EUC-KR 바이트로 변환한다.
        <form
          ref={formRef}
          name='payForm'
          method='post'
          action={returnUrl}
          acceptCharset='euc-kr'
          className='hidden'
          aria-hidden
        >
          <input type='hidden' name='PayMethod' value='CARD' />
          <input type='hidden' name='GoodsName' value={paymentInit.goodsNameShort} />
          <input type='hidden' name='Amt' value={paymentInit.amt} />
          <input type='hidden' name='MID' value={paymentInit.mid} />
          <input type='hidden' name='Moid' value={paymentInit.moid} />
          <input type='hidden' name='BuyerName' value='-' />
          <input type='hidden' name='BuyerEmail' value='' />
          <input type='hidden' name='BuyerTel' value='01000000000' />
          <input type='hidden' name='ReturnURL' value={returnUrl} />
          <input type='hidden' name='ReqReserved' value={mallReserved} />
          <input type='hidden' name='NpLang' value='KO' />
          <input type='hidden' name='GoodsCl' value='1' />
          <input type='hidden' name='TransType' value='0' />
          <input type='hidden' name='CharSet' value='euc-kr' />
          <input type='hidden' name='EdiDate' value={paymentInit.ediDate} />
          <input type='hidden' name='SignData' value={paymentInit.signData} />
          {/* 네이티브 앱(WebView)에서 결제 시, 카드사 앱 이탈 후 우리 앱으로 복귀하기 위한 scheme.
              NICEPay v3 공식 필드명은 WapUrl (AppScheme 아님). 미설정 시 NICEPay가 외부 브라우저로 fallback.
              IspCancelUrl 은 ISP/페이북 결제에서 사용자가 취소했을 때 복귀할 URL — 공식 가이드상 WebView 환경에서 필수. */}
          {appScheme && <input type='hidden' name='WapUrl' value={appScheme} />}
          {appScheme && <input type='hidden' name='IspCancelUrl' value={appScheme} />}
        </form>
      ) : null}

      <Card className='p-4'>
        <div className='space-y-2'>
          <p className='text-muted-foreground text-sm'>결제 금액</p>
          <p className='text-2xl font-bold'>{displayAmount.toLocaleString('ko-KR')}원</p>
        </div>

        <dl className='mt-4 space-y-2 border-t pt-4 text-sm'>
          <div className='flex items-start gap-3'>
            <dt className='text-muted-foreground w-16 shrink-0'>상품</dt>
            <dd className='font-medium'>{displayGoodsName}</dd>
          </div>
          {optionSelections && optionSelections.length > 0
            ? optionSelections.map((s, i) => (
                <div key={`${s.group_name}-${i}`} className='flex items-start gap-3'>
                  <dt className='text-muted-foreground w-16 shrink-0'>{s.group_name}</dt>
                  <dd className='font-medium'>{s.option_name}</dd>
                </div>
              ))
            : null}
        </dl>
      </Card>

      {!paymentInit ? (
        <p className='text-destructive text-sm'>
          결제 연동 정보가 없습니다. 서버 환경변수 NEXT_PUBLIC_NICEPAY_MID, NICEPAY_MERCHANT_KEY를
          확인해 주세요.
        </p>
      ) : !scriptReady || !returnUrl ? (
        <div className='text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm'>
          <Loader2 className='h-4 w-4 animate-spin' />
          결제 준비 중…
        </div>
      ) : (
        <Button className='w-full' size='lg' disabled={paying} onClick={startPay}>
          {paying ? '결제창 열림…' : '카드 결제하기'}
        </Button>
      )}

      <Button
        variant='outline'
        className='w-full'
        type='button'
        onClick={() => void handleCancel()}
      >
        돌아가기 (주문 취소)
      </Button>
    </div>
  );
}
