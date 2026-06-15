'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  cancelPendingMealOrder,
  startMealPayment,
  type MockExamOptionSelectionInput,
  type OrderConflictItem,
} from '@/lib/actions/meal';
import { ConflictDialog } from '@/components/shared/payment/conflict-dialog';
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
 *
 * 주문(meal_orders pending 행)은 결제 페이지 진입 시점이 아니라 "카드 결제하기" 클릭 시점에
 * `startMealPayment` 로 생성된다. 결제하지 않고 이탈하면 주문이 애초에 만들어지지 않아
 * 유령 결제대기/신청대기가 남지 않는다.
 */
export function PayClient({
  mallReserved,
  backHref,
  category,
  variantId,
  studentId,
  optionSelectionsInput,
  displayAmount,
  displayGoodsName,
  optionSelections,
}: {
  mallReserved: 's' | 'p';
  backHref: string;
  /** conflict 다이얼로그 문구 분기용. */
  category: 'meal' | 'exam';
  /** 결제 대상 variant. "카드 결제하기" 시 이 variant 로 주문을 생성한다. */
  variantId: string;
  /** 결제 대상 학생(본인 또는 자녀). */
  studentId: string;
  /** 모의고사 선택 옵션(서버 검증/저장용). 급식은 undefined. */
  optionSelectionsInput?: MockExamOptionSelectionInput[];
  displayAmount: number;
  displayGoodsName: string;
  /** 모의고사 옵션 표시(스냅샷). 비어있거나 undefined면 옵션 영역 미표시. */
  optionSelections?: { group_name: string; option_name: string }[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [scriptReady, setScriptReady] = useState(false);
  /** startMealPayment 서버액션 진행 중(주문 생성/검증). */
  const [submitting, setSubmitting] = useState(false);
  /** goPay 로 결제창이 열린 상태. */
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<OrderConflictItem[] | null>(null);
  const [paymentInit, setPaymentInit] = useState<PaymentInit | null>(null);
  /** paymentInit 가 DOM 에 commit 된 뒤 goPay 를 호출하기 위한 트리거. */
  const [pendingGoPay, setPendingGoPay] = useState(false);
  /** 생성된 주문 row id. 콜백(nicepayClose/돌아가기)에서 최신 값을 읽으려고 ref 로 둔다. */
  const orderRowIdRef = useRef<string | null>(null);

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

  const setOrder = useCallback((id: string | null) => {
    orderRowIdRef.current = id;
  }, []);

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
      // 사용자가 결제창을 닫음 → 방금 만든 미완료 주문을 정리해 유령 주문이 남지 않게 한다.
      const id = orderRowIdRef.current;
      if (id) void cancelPendingMealOrder(id);
      setOrder(null);
      setPaymentInit(null);
      alert('결제가 취소되었습니다.');
    };
    return () => {
      delete window.nicepaySubmit;
      delete window.nicepayClose;
    };
  }, [scriptReady, setOrder]);

  // paymentInit 가 form 에 반영(commit)된 뒤에만 goPay 호출. onClick 직후 호출하면
  // controlled input 의 DOM value 가 아직 갱신 전이라 결제 파라미터가 비어 전송된다.
  useEffect(() => {
    if (!pendingGoPay) return;
    if (!paymentInit || !formRef.current || typeof window.goPay !== 'function') return;
    setPendingGoPay(false);
    setPaying(true);
    try {
      window.goPay(formRef.current);
    } catch (e) {
      console.error(e);
      setPaying(false);
      setError('결제창을 여는 중 오류가 발생했습니다.');
    }
  }, [pendingGoPay, paymentInit]);

  const runPay = useCallback(
    async (force: boolean) => {
      if (!returnUrl.startsWith('http')) {
        setError('결제 준비가 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.');
        return;
      }
      setError(null);
      setSubmitting(true);
      try {
        const res = await startMealPayment(variantId, studentId, {
          force: force || undefined,
          optionSelections:
            optionSelectionsInput && optionSelectionsInput.length > 0
              ? optionSelectionsInput
              : undefined,
        });
        if (res.conflict && res.conflict.length > 0 && !force) {
          setConflict(res.conflict);
          return;
        }
        if (res.error || !res.paymentInit || !res.orderRowId) {
          setError(res.error || '결제 준비에 실패했습니다.');
          return;
        }
        setConflict(null);
        setOrder(res.orderRowId);
        setPaymentInit(res.paymentInit);
        setPendingGoPay(true);
      } catch (e) {
        console.error(e);
        setError('오류가 발생했습니다.');
      } finally {
        setSubmitting(false);
      }
    },
    [returnUrl, variantId, studentId, optionSelectionsInput, setOrder],
  );

  const handleCancel = useCallback(async () => {
    const id = orderRowIdRef.current;
    if (id) await cancelPendingMealOrder(id);
    router.push(backHref);
  }, [router, backHref]);

  const busy = submitting || paying;

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

      {error ? <p className='text-destructive text-sm'>{error}</p> : null}

      {!scriptReady || !returnUrl ? (
        <div className='text-muted-foreground flex items-center justify-center gap-2 py-8 text-sm'>
          <Loader2 className='h-4 w-4 animate-spin' />
          결제 준비 중…
        </div>
      ) : (
        <Button className='w-full' size='lg' disabled={busy} onClick={() => void runPay(false)}>
          {submitting ? (
            <>
              <Loader2 className='mr-2 h-4 w-4 animate-spin' />
              결제 준비 중…
            </>
          ) : paying ? (
            '결제창 열림…'
          ) : (
            '카드 결제하기'
          )}
        </Button>
      )}

      <Button
        variant='outline'
        className='w-full'
        type='button'
        disabled={busy}
        onClick={() => void handleCancel()}
      >
        돌아가기
      </Button>

      {conflict && conflict.length > 0 ? (
        <ConflictDialog
          conflicts={conflict}
          category={category}
          loading={submitting}
          onCancel={() => setConflict(null)}
          onConfirm={() => void runPay(true)}
        />
      ) : null}
    </div>
  );
}
